"""
预约管理业务逻辑
"""
from .models import Reservation
from apps.instruments.services import InstrumentService
from apps.notifications.services import NotificationService
from common.exceptions import NotFoundException, ConflictException, ValidationException
from common.utils.datetime_utils import is_slot_conflict
from common.utils.redis_utils import RedisLock, delete_cache
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


class ReservationService:
    @staticmethod
    def get_reservation_by_id(reservation_id):
        try:
            return Reservation.objects.get(id=reservation_id)
        except Reservation.DoesNotExist:
            raise NotFoundException(f'预约不存在: {reservation_id}')

    @staticmethod
    def check_time_conflict(instrument_id, start_time, end_time, exclude_reservation_id=None):
        reservations = Reservation.objects.filter(
            instrument_id=instrument_id,
            status__in=['pending', 'approved', 'in_progress']
        )
        if exclude_reservation_id:
            reservations = reservations.exclude(id=exclude_reservation_id)

        for res in reservations:
            if is_slot_conflict(start_time, end_time, res.start_time, res.end_time):
                return True
        return False

    @staticmethod
    def create_reservation(data, user):
        instrument = InstrumentService.get_instrument_by_id(str(data['instrument'].id))

        if not instrument.is_available:
            raise ValidationException(f'仪器当前状态为 {instrument.status_text}，无法预约')

        duration = (data['end_time'] - data['start_time']).total_seconds() / 3600
        if duration < instrument.min_reservation_hours:
            raise ValidationException(
                f'预约时长不能小于 {instrument.min_reservation_hours} 小时'
            )
        if duration > instrument.max_reservation_hours:
            raise ValidationException(
                f'预约时长不能超过 {instrument.max_reservation_hours} 小时'
            )

        instrument_lock_key = settings.REDIS_KEYS['RESERVATION_LOCK'].format(
            instrument_id=str(instrument.id),
            slot_key='global'
        )

        with RedisLock(instrument_lock_key, expire=120) as lock:
            if not lock.acquired:
                raise ConflictException('系统繁忙，请稍后再试')

            if ReservationService.check_time_conflict(
                str(instrument.id),
                data['start_time'],
                data['end_time']
            ):
                raise ConflictException('该时段已被预约，请选择其他时段')

            reservation = Reservation(
                user=user,
                instrument=instrument,
                start_time=data['start_time'],
                end_time=data['end_time'],
                purpose=data['purpose'],
                experiment_project=data.get('experiment_project', '')
            )

            if not instrument.requires_approval:
                reservation.status = 'approved'

            reservation.save()

            InstrumentService.clear_date_cache(str(instrument.id), data['start_time'].date())
            if data['end_time'].date() != data['start_time'].date():
                InstrumentService.clear_date_cache(str(instrument.id), data['end_time'].date())

            NotificationService.create_reservation_notification(reservation)

            return reservation

    @staticmethod
    def update_reservation(reservation_id, data, user):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if str(reservation.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能修改自己的预约')

        if reservation.status not in ['pending']:
            raise ValidationException('只能修改待审核的预约')

        if 'start_time' in data or 'end_time' in data:
            start_time = data.get('start_time', reservation.start_time)
            end_time = data.get('end_time', reservation.end_time)

            if end_time <= start_time:
                raise ValidationException('结束时间必须大于开始时间')

            if start_time <= timezone.now():
                raise ValidationException('开始时间必须晚于当前时间')

            instrument_lock_key = settings.REDIS_KEYS['RESERVATION_LOCK'].format(
                instrument_id=str(reservation.instrument.id),
                slot_key='global'
            )

            with RedisLock(instrument_lock_key, expire=120) as lock:
                if not lock.acquired:
                    raise ConflictException('系统繁忙，请稍后再试')

                if ReservationService.check_time_conflict(
                    str(reservation.instrument.id),
                    start_time,
                    end_time,
                    exclude_reservation_id=reservation_id
                ):
                    raise ConflictException('该时段已被预约，请选择其他时段')

                old_start_date = reservation.start_time.date()
                old_end_date = reservation.end_time.date()
                InstrumentService.clear_date_cache(str(reservation.instrument.id), old_start_date)
                if old_end_date != old_start_date:
                    InstrumentService.clear_date_cache(str(reservation.instrument.id), old_end_date)

                new_start_date = start_time.date()
                new_end_date = end_time.date()
                InstrumentService.clear_date_cache(str(reservation.instrument.id), new_start_date)
                if new_end_date != new_start_date:
                    InstrumentService.clear_date_cache(str(reservation.instrument.id), new_end_date)

                reservation.start_time = start_time
                reservation.end_time = end_time

        for field, value in data.items():
            if field not in ['start_time', 'end_time']:
                setattr(reservation, field, value)

        reservation.save()
        return reservation

    @staticmethod
    def cancel_reservation(reservation_id, user, reason=''):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if str(reservation.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能取消自己的预约')

        if not reservation.can_cancel:
            raise ValidationException('该预约无法取消')

        reservation.status = 'cancelled'
        reservation.cancel_reason = reason
        reservation.cancelled_at = timezone.now()
        reservation.cancelled_by = user
        reservation.save()

        InstrumentService.clear_date_cache(str(reservation.instrument.id), reservation.start_time.date())

        NotificationService.create_cancel_notification(reservation)

        return reservation

    @staticmethod
    def approve_reservation(reservation_id, action, user, reason=''):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if not reservation.can_approve:
            raise ValidationException('该预约无法审核')

        if action == 'approve':
            reservation.status = 'approved'
            reservation.approved_by = user
            reservation.approved_at = timezone.now()
        elif action == 'reject':
            reservation.status = 'rejected'
            reservation.reject_reason = reason
            reservation.approved_by = user
            reservation.approved_at = timezone.now()
        else:
            raise ValidationException(f'无效的操作: {action}')

        reservation.save()

        InstrumentService.clear_date_cache(str(reservation.instrument.id), reservation.start_time.date())

        NotificationService.create_approval_notification(reservation, action, reason)

        return reservation

    @staticmethod
    def start_reservation(reservation_id, user):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if str(reservation.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能开始自己的预约')

        if not reservation.can_start:
            raise ValidationException('该预约无法开始使用')

        reservation.status = 'in_progress'
        reservation.save()

        reservation.instrument.status = 'in_use'
        reservation.instrument.save()

        InstrumentService.clear_instrument_cache(str(reservation.instrument.id))

        return reservation

    @staticmethod
    def complete_reservation(reservation_id, user):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if str(reservation.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能结束自己的预约')

        if not reservation.can_complete:
            raise ValidationException('该预约无法结束')

        reservation.status = 'completed'
        reservation.end_time = timezone.now()
        reservation.save()

        reservation.instrument.status = 'available'
        reservation.instrument.save()

        InstrumentService.clear_instrument_cache(str(reservation.instrument.id))
        InstrumentService.clear_date_cache(str(reservation.instrument.id), reservation.start_time.date())

        return reservation

    @staticmethod
    def get_user_reservations(user_id, status=None):
        reservations = Reservation.objects.filter(user_id=user_id)
        if status:
            reservations = reservations.filter(status=status)
        return reservations.order_by('-start_time')

    @staticmethod
    def get_instrument_reservations(instrument_id, start_date=None, end_date=None):
        reservations = Reservation.objects.filter(
            instrument_id=instrument_id,
            status__in=['pending', 'approved', 'in_progress']
        )
        if start_date:
            reservations = reservations.filter(start_time__date__gte=start_date)
        if end_date:
            reservations = reservations.filter(start_time__date__lte=end_date)
        return reservations.order_by('start_time')

    @staticmethod
    def get_calendar_data(instrument_id, start_date, end_date):
        reservations = ReservationService.get_instrument_reservations(
            instrument_id, start_date, end_date
        )

        date_map = {}
        current = start_date
        while current <= end_date:
            date_map[current.strftime('%Y-%m-%d')] = []
            current += timedelta(days=1)

        for res in reservations:
            date_key = res.start_time.strftime('%Y-%m-%d')
            if date_key in date_map:
                date_map[date_key].append(res)

        result = []
        for date, res_list in sorted(date_map.items()):
            result.append({
                'date': date,
                'reservations': res_list
            })

        return result

    @staticmethod
    def get_dashboard_stats(user=None):
        now = timezone.now()
        today = now.date()

        base_query = Reservation.objects.all()
        if user:
            base_query = base_query.filter(user=user)

        total = base_query.count()
        pending = base_query.filter(status='pending').count()
        approved = base_query.filter(status='approved').count()
        in_progress = base_query.filter(status='in_progress').count()
        completed = base_query.filter(status='completed').count()

        today_reservations = base_query.filter(start_time__date=today).count()

        return {
            'total': total,
            'pending': pending,
            'approved': approved,
            'in_progress': in_progress,
            'completed': completed,
            'today': today_reservations
        }

    @staticmethod
    def update_expired_reservations():
        now = timezone.now()
        expired = Reservation.objects.filter(
            status='approved',
            end_time__lt=now
        ).update(status='expired')

        pending_expired = Reservation.objects.filter(
            status='pending',
            start_time__lt=now
        ).update(status='expired')

        logger.info(f'更新过期预约: {expired} 个已过期, {pending_expired} 个待审核过期')

        return expired + pending_expired

    @staticmethod
    def get_my_calendar(user, start_date, end_date):
        reservations = Reservation.objects.filter(
            user=user,
            start_time__date__gte=start_date,
            start_time__date__lte=end_date
        ).order_by('start_time')

        date_map = {}
        current = start_date
        while current <= end_date:
            date_map[current.strftime('%Y-%m-%d')] = []
            current += timedelta(days=1)

        for res in reservations:
            date_key = res.start_time.strftime('%Y-%m-%d')
            if date_key in date_map:
                date_map[date_key].append(res)

        result = []
        for date, res_list in sorted(date_map.items()):
            result.append({
                'date': date,
                'reservations': res_list
            })

        return result

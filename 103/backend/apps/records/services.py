"""
使用记录业务逻辑
"""
from django.db.models import Avg, Count, Q
from .models import UseRecord, InstrumentEvaluation, ViolationRecord
from apps.reservations.services import ReservationService
from apps.instruments.services import InstrumentService
from common.exceptions import NotFoundException, ValidationException, ForbiddenException
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


class UseRecordService:
    @staticmethod
    def get_record_by_id(record_id):
        try:
            return UseRecord.objects.get(id=record_id)
        except UseRecord.DoesNotExist:
            raise NotFoundException(f'使用记录不存在: {record_id}')

    @staticmethod
    def create_record(data, user):
        if 'reservation' in data and data['reservation']:
            reservation = ReservationService.get_reservation_by_id(str(data['reservation'].id))
            if str(reservation.user.id) != str(user.id) and not user.is_staff:
                raise ValidationException('只能为自己的预约创建使用记录')

        instrument = InstrumentService.get_instrument_by_id(str(data['instrument'].id))

        record = UseRecord(
            user=user,
            instrument=instrument,
            reservation=data.get('reservation'),
            start_time=data['start_time'],
            end_time=data.get('end_time'),
            experiment_content=data.get('experiment_content', ''),
            sample_info=data.get('sample_info', ''),
            result_summary=data.get('result_summary', ''),
            anomalies=data.get('anomalies', '')
        )
        record.save()

        return record

    @staticmethod
    def update_record(record_id, data, user):
        record = UseRecordService.get_record_by_id(record_id)

        if str(record.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能修改自己的使用记录')

        for field, value in data.items():
            setattr(record, field, value)

        record.save()
        return record

    @staticmethod
    def delete_record(record_id, user):
        record = UseRecordService.get_record_by_id(record_id)

        if str(record.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能删除自己的使用记录')

        record.delete()

    @staticmethod
    def create_from_reservation(reservation_id, user):
        reservation = ReservationService.get_reservation_by_id(reservation_id)

        if str(reservation.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能为自己的预约创建使用记录')

        if reservation.status != 'in_progress':
            raise ValidationException('只能为进行中的预约创建使用记录')

        record = UseRecord(
            user=reservation.user,
            instrument=reservation.instrument,
            reservation=reservation,
            start_time=reservation.start_time,
            end_time=timezone.now(),
            experiment_content=reservation.purpose,
        )
        record.save()

        return record

    @staticmethod
    def complete_record(record_id, data, user):
        record = UseRecordService.get_record_by_id(record_id)

        if str(record.user.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能结束自己的使用记录')

        if record.end_time:
            raise ValidationException('该使用记录已经结束')

        record.end_time = data.get('end_time', timezone.now())
        record.experiment_content = data.get('experiment_content', record.experiment_content)
        record.sample_info = data.get('sample_info', record.sample_info)
        record.result_summary = data.get('result_summary', record.result_summary)
        record.anomalies = data.get('anomalies', record.anomalies)
        record.save()

        return record

    @staticmethod
    def get_user_records(user_id, instrument_id=None, start_date=None, end_date=None):
        records = UseRecord.objects.filter(user_id=user_id)
        if instrument_id:
            records = records.filter(instrument_id=instrument_id)
        if start_date:
            records = records.filter(start_time__date__gte=start_date)
        if end_date:
            records = records.filter(start_time__date__lte=end_date)
        return records.order_by('-start_time')

    @staticmethod
    def get_instrument_records(instrument_id, start_date=None, end_date=None):
        records = UseRecord.objects.filter(instrument_id=instrument_id)
        if start_date:
            records = records.filter(start_time__date__gte=start_date)
        if end_date:
            records = records.filter(start_time__date__lte=end_date)
        return records.order_by('-start_time')

    @staticmethod
    def get_dashboard_stats(user=None):
        now = timezone.now()
        month_ago = now - timedelta(days=30)

        base_query = UseRecord.objects.all()
        if user:
            base_query = base_query.filter(user=user)

        total = base_query.count()
        month_records = base_query.filter(created_at__gte=month_ago).count()

        total_hours = sum([
            r.usage_duration or 0
            for r in base_query.filter(end_time__isnull=False)
        ])

        instrument_count = base_query.values('instrument_id').distinct().count()

        return {
            'total_records': total,
            'total_hours': round(total_hours, 2),
            'instrument_count': instrument_count,
            'month_records': month_records
        }

    @staticmethod
    def get_instrument_usage_stats(instrument_id, days=30):
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days - 1)

        records = UseRecord.objects.filter(
            instrument_id=instrument_id,
            start_time__date__gte=start_date,
            start_time__date__lte=end_date
        )

        daily_stats = {}
        for i in range(days):
            date = start_date + timedelta(days=i)
            daily_stats[date.strftime('%Y-%m-%d')] = {
                'date': date.strftime('%Y-%m-%d'),
                'hours': 0,
                'count': 0
            }

        for record in records:
            date_key = record.start_time.strftime('%Y-%m-%d')
            if date_key in daily_stats:
                daily_stats[date_key]['hours'] += record.usage_duration or 0
                daily_stats[date_key]['count'] += 1

        return list(daily_stats.values())

    @staticmethod
    def get_user_usage_stats(user_id, days=30):
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days - 1)

        records = UseRecord.objects.filter(
            user_id=user_id,
            start_time__date__gte=start_date,
            start_time__date__lte=end_date
        )

        daily_stats = {}
        for i in range(days):
            date = start_date + timedelta(days=i)
            daily_stats[date.strftime('%Y-%m-%d')] = {
                'date': date.strftime('%Y-%m-%d'),
                'hours': 0,
                'count': 0
            }

        for record in records:
            date_key = record.start_time.strftime('%Y-%m-%d')
            if date_key in daily_stats:
                daily_stats[date_key]['hours'] += record.usage_duration or 0
                daily_stats[date_key]['count'] += 1

        return list(daily_stats.values())


class EvaluationService:
    @staticmethod
    def create_evaluation(data, user):
        evaluation = InstrumentEvaluation(
            user=user,
            instrument=data['instrument'],
            use_record=data.get('use_record'),
            rating=data['rating'],
            content=data.get('content', ''),
            tags=data.get('tags', '')
        )
        evaluation.save()
        return evaluation

    @staticmethod
    def get_evaluation_by_id(evaluation_id):
        try:
            return InstrumentEvaluation.objects.get(id=evaluation_id)
        except InstrumentEvaluation.DoesNotExist:
            raise NotFoundException(f'评价不存在: {evaluation_id}')

    @staticmethod
    def get_instrument_evaluations(instrument_id):
        return InstrumentEvaluation.objects.filter(instrument_id=instrument_id)

    @staticmethod
    def get_user_evaluations(user_id):
        return InstrumentEvaluation.objects.filter(user_id=user_id)

    @staticmethod
    def get_record_evaluations(record_id):
        return InstrumentEvaluation.objects.filter(use_record_id=record_id)

    @staticmethod
    def get_instrument_avg_rating(instrument_id):
        result = InstrumentEvaluation.objects.filter(instrument_id=instrument_id).aggregate(
            avg_rating=Avg('rating'),
            count=Count('id')
        )
        return {
            'avg_rating': round(result['avg_rating'], 1) if result['avg_rating'] else 0,
            'count': result['count']
        }

    @staticmethod
    def get_instrument_rating_distribution(instrument_id):
        evaluations = InstrumentEvaluation.objects.filter(instrument_id=instrument_id)
        distribution = {str(i): 0 for i in range(1, 6)}
        for evaluation in evaluations:
            key = str(evaluation.rating)
            if key in distribution:
                distribution[key] += 1
        return distribution


class ViolationService:
    @staticmethod
    def create_violation(data, reported_by):
        violation = ViolationRecord(
            user=data['user'],
            instrument=data['instrument'],
            use_record=data.get('use_record'),
            reported_by=reported_by,
            violation_type=data['violation_type'],
            severity=data['severity'],
            description=data['description']
        )
        violation.save()
        return violation

    @staticmethod
    def get_violation_by_id(violation_id):
        try:
            return ViolationRecord.objects.get(id=violation_id)
        except ViolationRecord.DoesNotExist:
            raise NotFoundException(f'违规记录不存在: {violation_id}')

    @staticmethod
    def get_user_violations(user_id, status=None):
        qs = ViolationRecord.objects.filter(user_id=user_id)
        if status:
            qs = qs.filter(status=status)
        return qs

    @staticmethod
    def get_instrument_violations(instrument_id, status=None):
        qs = ViolationRecord.objects.filter(instrument_id=instrument_id)
        if status:
            qs = qs.filter(status=status)
        return qs

    @staticmethod
    def get_record_violations(record_id):
        return ViolationRecord.objects.filter(use_record_id=record_id)

    @staticmethod
    def get_pending_violations():
        return ViolationRecord.objects.filter(status='pending')

    @staticmethod
    def resolve_violation(violation_id, data, resolved_by):
        violation = ViolationService.get_violation_by_id(violation_id)

        if violation.status in ['resolved', 'dismissed']:
            raise ValidationException('该违规记录已处理')

        new_status = data.get('status')
        if new_status not in ['confirmed', 'dismissed', 'resolved']:
            raise ValidationException('无效的处理状态')

        violation.status = new_status
        violation.penalty = data.get('penalty', '')
        violation.resolved_by = resolved_by
        violation.resolved_at = timezone.now()
        violation.save()
        return violation

    @staticmethod
    def appeal_violation(violation_id, appeal_reason, user):
        violation = ViolationService.get_violation_by_id(violation_id)

        if str(violation.user.id) != str(user.id):
            raise ForbiddenException('只能对自己的违规记录申诉')

        if violation.status != 'confirmed':
            raise ValidationException('只能对已确认的违规记录申诉')

        violation.status = 'appealed'
        violation.appeal_reason = appeal_reason
        violation.save()
        return violation

    @staticmethod
    def get_violation_stats(user_id=None):
        base_query = ViolationRecord.objects.all()
        if user_id:
            base_query = base_query.filter(user_id=user_id)

        total = base_query.count()
        by_status = dict(
            base_query.values_list('status').annotate(count=Count('id'))
        )
        by_severity = dict(
            base_query.values_list('severity').annotate(count=Count('id'))
        )
        by_type = dict(
            base_query.values_list('violation_type').annotate(count=Count('id'))
        )

        return {
            'total': total,
            'by_status': by_status,
            'by_severity': by_severity,
            'by_type': by_type,
        }

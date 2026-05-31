"""
仪器管理业务逻辑
"""
from .models import Instrument, InstrumentCategory, InstrumentMaintenance
from common.exceptions import NotFoundException, ConflictException, ValidationException
from common.utils.datetime_utils import generate_time_slots, combine_date_time, is_slot_conflict
from common.utils.redis_utils import get_cache, set_cache, delete_cache, RedisLock
from django.conf import settings
from django.utils import timezone
from datetime import timedelta, datetime
import logging

logger = logging.getLogger(__name__)


class InstrumentService:
    @staticmethod
    def get_instrument_by_id(instrument_id):
        try:
            return Instrument.objects.get(id=instrument_id)
        except Instrument.DoesNotExist:
            raise NotFoundException(f'仪器不存在: {instrument_id}')

    @staticmethod
    def get_instrument_by_code(code):
        try:
            return Instrument.objects.get(code=code)
        except Instrument.DoesNotExist:
            raise NotFoundException(f'仪器不存在: {code}')

    @staticmethod
    def create_instrument(data, created_by=None):
        if Instrument.objects.filter(code=data['code']).exists():
            raise ConflictException(f'仪器编号已存在: {data["code"]}')

        instrument = Instrument(**data)
        instrument.save()
        return instrument

    @staticmethod
    def update_instrument(instrument_id, data, updated_by=None):
        instrument = InstrumentService.get_instrument_by_id(instrument_id)

        if 'code' in data and data['code'] != instrument.code:
            if Instrument.objects.filter(code=data['code']).exclude(id=instrument_id).exists():
                raise ConflictException(f'仪器编号已存在: {data["code"]}')

        for field, value in data.items():
            setattr(instrument, field, value)
        instrument.save()

        InstrumentService.clear_instrument_cache(instrument_id)
        return instrument

    @staticmethod
    def delete_instrument(instrument_id, deleted_by=None):
        instrument = InstrumentService.get_instrument_by_id(instrument_id)
        InstrumentService.clear_instrument_cache(instrument_id)
        instrument.delete()

    @staticmethod
    def toggle_status(instrument_id, status):
        instrument = InstrumentService.get_instrument_by_id(instrument_id)
        if status not in dict(Instrument.STATUS_CHOICES):
            raise ValidationException(f'无效的状态: {status}')
        instrument.status = status
        instrument.save()
        InstrumentService.clear_instrument_cache(instrument_id)
        return instrument

    @staticmethod
    def get_available_slots(instrument_id, date):
        cache_key = settings.REDIS_KEYS['INSTRUMENT_SLOTS'].format(
            instrument_id=instrument_id,
            date=date.strftime('%Y-%m-%d')
        )

        cached_slots = get_cache(cache_key)
        if cached_slots is not None:
            return cached_slots

        instrument = InstrumentService.get_instrument_by_id(instrument_id)
        slots = InstrumentService._generate_slots(instrument, date)

        set_cache(cache_key, slots, timeout=3600)
        return slots

    @staticmethod
    def _generate_slots(instrument, date):
        from apps.reservations.models import Reservation
        from django.db.models import Q

        settings_config = settings.RESERVATION_SETTINGS
        interval_minutes = settings_config['time_slot_interval']
        time_slots = generate_time_slots(
            start_time_str=settings_config['daily_start_time'],
            end_time_str=settings_config['daily_end_time'],
            interval_minutes=interval_minutes
        )

        reservations = Reservation.objects.filter(
            instrument=instrument,
            start_time__date=date,
            status__in=['pending', 'approved', 'in_progress']
        ).select_related('user')

        now = timezone.now()
        result = []

        for slot in time_slots:
            slot_start = combine_date_time(date, slot['start'])
            slot_end = combine_date_time(date, slot['end'])

            status = 'available'
            reservation_id = None
            reserved_by = None

            if slot_end < now:
                status = 'expired'
            else:
                for res in reservations:
                    if is_slot_conflict(slot_start, slot_end, res.start_time, res.end_time):
                        status = 'reserved'
                        reservation_id = str(res.id)
                        reserved_by = res.user.real_name
                        break

            result.append({
                'date': date.strftime('%Y-%m-%d'),
                'start': slot['start'],
                'end': slot['end'],
                'status': status,
                'reservation_id': reservation_id,
                'reserved_by': reserved_by,
                'recommendation': None
            })

        slot_duration_hours = interval_minutes / 60.0
        max_hours = instrument.max_reservation_hours
        peak_data = InstrumentService._get_slot_usage_data(instrument, days=7)

        windows = []
        i = 0
        while i < len(result):
            if result[i]['status'] == 'available':
                window_start = i
                while i < len(result) and result[i]['status'] == 'available':
                    i += 1
                windows.append((window_start, i - 1))
            else:
                i += 1

        for win_start, win_end in windows:
            window_length = (win_end - win_start + 1) * slot_duration_hours
            for idx in range(win_start, win_end + 1):
                slot_key = f"{result[idx]['start']}-{result[idx]['end']}"
                slot_rate = peak_data.get(slot_key, 0)

                if abs(window_length - max_hours) < 0.01:
                    result[idx]['recommendation'] = 'best_fit'
                elif window_length > 2:
                    result[idx]['recommendation'] = 'recommended'

                if slot_rate < 0.3:
                    if result[idx]['recommendation'] != 'best_fit':
                        if result[idx]['recommendation'] == 'recommended':
                            result[idx]['recommendation'] = 'low_demand'
                        else:
                            result[idx]['recommendation'] = 'low_demand'

        return result

    @staticmethod
    def _get_slot_usage_data(instrument, days=7):
        from apps.reservations.models import Reservation

        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days - 1)
        settings_config = settings.RESERVATION_SETTINGS
        interval_minutes = settings_config['time_slot_interval']

        time_slots = generate_time_slots(
            start_time_str=settings_config['daily_start_time'],
            end_time_str=settings_config['daily_end_time'],
            interval_minutes=interval_minutes
        )

        total_slots = {f"{s['start']}-{s['end']}": 0 for s in time_slots}

        reservations = Reservation.objects.filter(
            instrument=instrument,
            start_time__date__gte=start_date,
            start_time__date__lte=end_date,
            status__in=['pending', 'approved', 'in_progress', 'completed']
        )

        for res in reservations:
            for slot in time_slots:
                slot_key = f"{slot['start']}-{slot['end']}"
                slot_start = combine_date_time(res.start_time.date(), slot['start'])
                slot_end = combine_date_time(res.start_time.date(), slot['end'])
                if is_slot_conflict(slot_start, slot_end, res.start_time, res.end_time):
                    total_slots[slot_key] += 1

        return {k: v / days for k, v in total_slots.items()}

    @staticmethod
    def smart_recommend(instrument_id, date, duration_hours):
        instrument = InstrumentService.get_instrument_by_id(instrument_id)
        slots = InstrumentService._generate_slots(instrument, date)

        settings_config = settings.RESERVATION_SETTINGS
        interval_minutes = settings_config['time_slot_interval']
        slot_duration_hours = interval_minutes / 60.0

        needed_slots = int(duration_hours / slot_duration_hours)
        if duration_hours % slot_duration_hours > 0:
            needed_slots += 1

        available_indices = [
            i for i, s in enumerate(slots) if s['status'] == 'available'
        ]

        windows = []
        i = 0
        while i < len(available_indices):
            count = 1
            j = i + 1
            while j < len(available_indices) and available_indices[j] == available_indices[j - 1] + 1:
                count += 1
                j += 1
            if count >= needed_slots:
                window_length = count * slot_duration_hours
                start_idx = available_indices[i]
                end_idx = available_indices[i + count - 1]
                windows.append({
                    'start': slots[start_idx]['start'],
                    'end': slots[end_idx]['end'],
                    'window_length': round(window_length, 2),
                    'slot_count': count,
                    'start_index': start_idx,
                    'end_index': end_idx
                })
            i = j

        peak_data = InstrumentService._get_slot_usage_data(instrument, days=7)

        for w in windows:
            match_score = (1 - abs(w['window_length'] - duration_hours) / duration_hours) * 0.6

            slot_rates = []
            for idx in range(w['start_index'], w['end_index'] + 1):
                slot_key = f"{slots[idx]['start']}-{slots[idx]['end']}"
                slot_rates.append(peak_data.get(slot_key, 0))

            avg_rate = sum(slot_rates) / len(slot_rates) if slot_rates else 0
            history_score = 1 - min(avg_rate, 1.0)

            w['score'] = round(match_score + history_score * 0.4, 4)
            w['history_score'] = round(history_score, 4)

        windows.sort(key=lambda x: x['score'], reverse=True)

        for w in windows:
            del w['start_index']
            del w['end_index']

        return windows

    @staticmethod
    def get_peak_hours(instrument_id, days=30):
        from apps.reservations.models import Reservation

        instrument = InstrumentService.get_instrument_by_id(instrument_id)
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days - 1)

        settings_config = settings.RESERVATION_SETTINGS
        interval_minutes = settings_config['time_slot_interval']

        time_slots = generate_time_slots(
            start_time_str=settings_config['daily_start_time'],
            end_time_str=settings_config['daily_end_time'],
            interval_minutes=interval_minutes
        )

        slot_counts = {f"{s['start']}-{s['end']}": 0 for s in time_slots}

        reservations = Reservation.objects.filter(
            instrument=instrument,
            start_time__date__gte=start_date,
            start_time__date__lte=end_date,
            status__in=['pending', 'approved', 'in_progress', 'completed']
        )

        for res in reservations:
            for slot in time_slots:
                slot_key = f"{slot['start']}-{slot['end']}"
                slot_start = combine_date_time(res.start_time.date(), slot['start'])
                slot_end = combine_date_time(res.start_time.date(), slot['end'])
                if is_slot_conflict(slot_start, slot_end, res.start_time, res.end_time):
                    slot_counts[slot_key] += 1

        result = []
        for slot in time_slots:
            slot_key = f"{slot['start']}-{slot['end']}"
            count = slot_counts[slot_key]
            result.append({
                'slot': slot_key,
                'count': count,
                'rate': round(count / days, 4)
            })

        return result

    @staticmethod
    def clear_instrument_cache(instrument_id):
        pattern = f"*instrument*{instrument_id}*"
        delete_cache(pattern)

    @staticmethod
    def clear_date_cache(instrument_id, date):
        cache_key = settings.REDIS_KEYS['INSTRUMENT_SLOTS'].format(
            instrument_id=instrument_id,
            date=date.strftime('%Y-%m-%d')
        )
        delete_cache(cache_key)

    @staticmethod
    def get_available_instruments():
        return Instrument.objects.filter(status='available')

    @staticmethod
    def get_dashboard_stats():
        total = Instrument.objects.count()
        available = Instrument.objects.filter(status='available').count()
        in_use = Instrument.objects.filter(status='in_use').count()
        maintenance = Instrument.objects.filter(status='maintenance').count()

        return {
            'total': total,
            'available': available,
            'in_use': in_use,
            'maintenance': maintenance
        }


class InstrumentCategoryService:
    @staticmethod
    def get_category_by_id(category_id):
        try:
            return InstrumentCategory.objects.get(id=category_id)
        except InstrumentCategory.DoesNotExist:
            raise NotFoundException(f'分类不存在: {category_id}')

    @staticmethod
    def create_category(data, created_by=None):
        if InstrumentCategory.objects.filter(code=data['code']).exists():
            raise ConflictException(f'分类编码已存在: {data["code"]}')

        category = InstrumentCategory(**data)
        category.save()
        return category

    @staticmethod
    def update_category(category_id, data, updated_by=None):
        category = InstrumentCategoryService.get_category_by_id(category_id)

        if 'code' in data and data['code'] != category.code:
            if InstrumentCategory.objects.filter(code=data['code']).exclude(id=category_id).exists():
                raise ConflictException(f'分类编码已存在: {data["code"]}')

        for field, value in data.items():
            setattr(category, field, value)
        category.save()
        return category

    @staticmethod
    def delete_category(category_id, deleted_by=None):
        category = InstrumentCategoryService.get_category_by_id(category_id)
        if Instrument.objects.filter(category_id=category_id).exists():
            raise ConflictException('该分类下还有仪器，无法删除')
        category.delete()

    @staticmethod
    def get_all_categories():
        return InstrumentCategory.objects.all()


class InstrumentMaintenanceService:
    @staticmethod
    def get_maintenance_by_id(maintenance_id):
        try:
            return InstrumentMaintenance.objects.get(id=maintenance_id)
        except InstrumentMaintenance.DoesNotExist:
            raise NotFoundException(f'维护记录不存在: {maintenance_id}')

    @staticmethod
    def create_maintenance(data, created_by=None):
        maintenance = InstrumentMaintenance(**data)
        maintenance.save()
        return maintenance

    @staticmethod
    def update_maintenance(maintenance_id, data, updated_by=None):
        maintenance = InstrumentMaintenanceService.get_maintenance_by_id(maintenance_id)
        for field, value in data.items():
            setattr(maintenance, field, value)
        maintenance.save()
        return maintenance

    @staticmethod
    def delete_maintenance(maintenance_id, deleted_by=None):
        maintenance = InstrumentMaintenanceService.get_maintenance_by_id(maintenance_id)
        maintenance.delete()

    @staticmethod
    def update_status(maintenance_id, status, remarks=''):
        maintenance = InstrumentMaintenanceService.get_maintenance_by_id(maintenance_id)
        if status not in dict(InstrumentMaintenance.STATUS_CHOICES):
            raise ValidationException(f'无效的状态: {status}')
        maintenance.status = status
        if remarks:
            maintenance.remarks = remarks
        if status == 'completed' and not maintenance.actual_date:
            maintenance.actual_date = timezone.now().date()
        maintenance.save()
        return maintenance

    @staticmethod
    def get_instrument_maintenances(instrument_id):
        return InstrumentMaintenance.objects.filter(instrument_id=instrument_id)

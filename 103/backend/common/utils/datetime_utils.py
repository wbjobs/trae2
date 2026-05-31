"""
日期时间工具函数
"""
from datetime import datetime, timedelta, time
from django.utils import timezone
import pytz


def get_local_now():
    return timezone.localtime(timezone.now())


def get_today():
    return get_local_now().date()


def get_date_range(start_date, end_date):
    days = []
    current = start_date
    while current <= end_date:
        days.append(current)
        current += timedelta(days=1)
    return days


def generate_time_slots(start_time_str='08:00', end_time_str='20:00', interval_minutes=30):
    slots = []
    start_h, start_m = map(int, start_time_str.split(':'))
    end_h, end_m = map(int, end_time_str.split(':'))

    start = time(start_h, start_m)
    end = time(end_h, end_m)

    current = start
    while current < end:
        next_time = (datetime.combine(datetime.today(), current) +
                     timedelta(minutes=interval_minutes)).time()
        slots.append({
            'start': current.strftime('%H:%M'),
            'end': next_time.strftime('%H:%M')
        })
        current = next_time

    return slots


def combine_date_time(date_obj, time_str):
    h, m = map(int, time_str.split(':'))
    return datetime.combine(date_obj, time(h, m), tzinfo=pytz.UTC)


def is_slot_conflict(start1, end1, start2, end2):
    return start1 < end2 and start2 < end1


def format_duration(start_time, end_time):
    if not start_time or not end_time:
        return 0
    delta = end_time - start_time
    return round(delta.total_seconds() / 3600, 2)

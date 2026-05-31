from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, count, sum, avg, when, date_format, 
    hour, dayofweek, month, year, lit, desc,
    row_number, rank
)
from pyspark.sql.window import Window
import logging
from datetime import datetime, timedelta
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FaultAnalyzer:
    def __init__(self, spark=None):
        self.spark = spark or SparkSession.builder \
            .appName("FaultAnalysis") \
            .config("spark.sql.session.timeZone", "Asia/Shanghai") \
            .enableHiveSupport() \
            .getOrCreate()

    def load_fault_data(self, start_date=None, end_date=None):
        logger.info("Loading fault data")
        query = "SELECT * FROM pv_fault_raw"
        conditions = []
        
        if start_date:
            conditions.append(f"fault_time >= '{start_date}'")
        if end_date:
            conditions.append(f"fault_time <= '{end_date}'")
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        df = self.spark.sql(query)
        logger.info(f"Loaded {df.count()} fault records")
        return df

    def classify_faults(self, df):
        logger.info("Classifying fault types")
        
        fault_type_mapping = (
            when(col('fault_code').startswith('INV'), '逆变器故障')
            .when(col('fault_code').startswith('PAN'), '组件异常')
            .when(col('fault_code').startswith('COM'), '通信中断')
            .when(col('fault_code').startswith('GRID'), '电网故障')
            .when(col('fault_code').startswith('COMB'), '汇流箱故障')
            .otherwise('其他故障')
        )
        
        df = df.withColumn('fault_type', fault_type_mapping)
        return df

    def get_fault_distribution(self, df, group_by='fault_type'):
        logger.info(f"Getting fault distribution by {group_by}")
        
        distribution = df.groupBy(group_by).agg(
            count('*').alias('fault_count'),
            count(when(col('status') == 'open', True)).alias('open_count'),
            count(when(col('status') == 'closed', True)).alias('closed_count'),
            avg(col('duration_hours')).alias('avg_duration')
        ).orderBy(desc('fault_count'))
        
        return distribution

    def get_fault_trend(self, df, frequency='daily'):
        logger.info(f"Getting fault trend by {frequency}")
        
        if frequency == 'daily':
            time_col = date_format(col('fault_time'), 'yyyy-MM-dd').alias('date')
        elif frequency == 'hourly':
            time_col = date_format(col('fault_time'), 'yyyy-MM-dd HH:00:00').alias('date')
        elif frequency == 'monthly':
            time_col = date_format(col('fault_time'), 'yyyy-MM').alias('date')
        else:
            time_col = date_format(col('fault_time'), 'yyyy-MM-dd').alias('date')
        
        trend = df.groupBy(time_col).agg(
            count('*').alias('fault_count')
        ).orderBy('date')
        
        return trend

    def get_top_fault_devices(self, df, limit=10):
        logger.info(f"Getting top {limit} devices with most faults")
        
        device_faults = df.groupBy('device_id', 'station_id', 'fault_type').agg(
            count('*').alias('fault_count'),
            avg(col('duration_hours')).alias('avg_duration')
        ).orderBy(desc('fault_count')).limit(limit)
        
        return device_faults

    def get_station_fault_comparison(self, df):
        logger.info("Getting station fault comparison")
        
        station_stats = df.groupBy('station_id').agg(
            count('*').alias('total_faults'),
            count(when(col('severity') == 'critical', True)).alias('critical_faults'),
            count(when(col('severity') == 'major', True)).alias('major_faults'),
            count(when(col('severity') == 'minor', True)).alias('minor_faults'),
            avg(col('duration_hours')).alias('avg_duration')
        ).orderBy(desc('total_faults'))
        
        return station_stats

    def get_severity_analysis(self, df):
        logger.info("Getting fault severity analysis")
        
        severity_stats = df.groupBy('severity').agg(
            count('*').alias('count'),
            avg(col('duration_hours')).alias('avg_duration'),
            sum(col('impact_power')).alias('total_impact')
        ).orderBy('count', ascending=False)
        
        return severity_stats

    def get_hourly_fault_pattern(self, df):
        logger.info("Getting hourly fault pattern")
        
        hourly_pattern = df.groupBy(
            hour(col('fault_time')).alias('hour')
        ).agg(
            count('*').alias('fault_count'),
            avg(col('duration_hours')).alias('avg_duration')
        ).orderBy('hour')
        
        return hourly_pattern

    def get_daily_fault_pattern(self, df):
        logger.info("Getting daily fault pattern")
        
        daily_pattern = df.groupBy(
            dayofweek(col('fault_time')).alias('day_of_week')
        ).agg(
            count('*').alias('fault_count')
        ).orderBy('day_of_week')
        
        day_mapping = {1: '周日', 2: '周一', 3: '周二', 4: '周三', 5: '周四', 6: '周五', 7: '周六'}
        for k, v in day_mapping.items():
            daily_pattern = daily_pattern.withColumn(
                'day_name',
                when(col('day_of_week') == k, v).otherwise(col('day_of_week'))
            )
        
        return daily_pattern

    def get_fault_heatmap_data(self, df):
        logger.info("Generating fault heatmap data")
        
        heatmap_data = df.groupBy(
            dayofweek(col('fault_time')).alias('day'),
            hour(col('fault_time')).alias('hour')
        ).agg(
            count('*').alias('fault_count')
        ).orderBy('day', 'hour')
        
        return heatmap_data

    def calculate_mtbf(self, df):
        logger.info("Calculating Mean Time Between Failures (MTBF)")
        
        window_spec = Window.partitionBy('device_id').orderBy('fault_time')
        
        df_with_prev = df.withColumn(
            'prev_fault_time',
            lag(col('fault_time')).over(window_spec)
        )
        
        df_with_interval = df_with_prev.withColumn(
            'time_between',
            col('fault_time').cast('long') - col('prev_fault_time').cast('long')
        )
        
        mtbf_by_device = df_with_interval.groupBy('device_id').agg(
            avg(col('time_between')).alias('avg_seconds_between'),
            count('*').alias('fault_count')
        ).withColumn(
            'mtbf_hours',
            col('avg_seconds_between') / 3600
        )
        
        return mtbf_by_device

    def run_fault_analysis(self, start_date=None, end_date=None):
        logger.info("Running comprehensive fault analysis")
        
        df = self.load_fault_data(start_date, end_date)
        df = self.classify_faults(df)
        
        results = {
            'fault_distribution': [row.asDict() for row in self.get_fault_distribution(df).collect()],
            'top_devices': [row.asDict() for row in self.get_top_fault_devices(df).collect()],
            'station_comparison': [row.asDict() for row in self.get_station_fault_comparison(df).collect()],
            'severity_analysis': [row.asDict() for row in self.get_severity_analysis(df).collect()],
            'hourly_pattern': [row.asDict() for row in self.get_hourly_fault_pattern(df).collect()],
            'fault_trend': [row.asDict() for row in self.get_fault_trend(df).collect()]
        }
        
        logger.info("Fault analysis completed")
        return results

    def get_fault_summary(self, start_date, end_date, station_id='all'):
        logger.info(f"Getting fault summary from {start_date} to {end_date}")
        
        df = self.load_fault_data(start_date, end_date)
        
        if station_id != 'all':
            df = df.filter(col('station_id') == station_id)
        
        summary = df.agg(
            count('*').alias('total_faults'),
            count(when(col('status') == 'open', True)).alias('open_faults'),
            count(when(col('severity') == 'critical', True)).alias('critical_faults'),
            avg(col('duration_hours')).alias('avg_duration')
        ).first()
        
        return {
            'total_faults': int(summary['total_faults'] or 0),
            'open_faults': int(summary['open_faults'] or 0),
            'critical_faults': int(summary['critical_faults'] or 0),
            'avg_duration': float(summary['avg_duration'] or 0)
        }

    def close(self):
        if self.spark:
            self.spark.stop()

if __name__ == "__main__":
    analyzer = FaultAnalyzer()
    try:
        results = analyzer.run_fault_analysis()
        print(json.dumps(results, indent=2, default=str))
    finally:
        analyzer.close()

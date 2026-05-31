from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, sum, avg, max, min, count, when, 
    date_format, hour, dayofweek, month, year,
    window, from_unixtime, lit, abs, round,
    lag, unix_timestamp, stddev
)
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType
import logging
from datetime import datetime, timedelta
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

W_TO_KW = 0.001
W_TO_MW = 0.000001
KWH_TO_MWH = 0.001

class PowerAggregator:
    def __init__(self, spark=None):
        self.spark = spark or SparkSession.builder \
            .appName("PowerAggregation") \
            .config("spark.sql.session.timeZone", "Asia/Shanghai") \
            .enableHiveSupport() \
            .getOrCreate()

    def load_cleaned_data(self, table_name, start_date=None, end_date=None):
        logger.info(f"Loading cleaned data from {table_name}")
        query = f"SELECT * FROM {table_name}"
        conditions = []
        
        if start_date:
            conditions.append(f"data_time >= '{start_date}'")
        if end_date:
            conditions.append(f"data_time <= '{end_date}'")
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        return self.spark.sql(query)

    def normalize_power_units(self, df, power_columns=None):
        logger.info("Normalizing power units to kW")
        
        if power_columns is None:
            power_columns = ['power_output', 'active_power', 'reactive_power']
        
        for col_name in power_columns:
            if col_name in df.columns:
                df = df.withColumn(
                    col_name,
                    round(col(col_name) * W_TO_KW, 4)
                )
                logger.info(f"  - {col_name}: W -> kW")
        
        return df

    def validate_power_data(self, df):
        logger.info("Validating power data before aggregation")
        
        initial_count = df.count()
        
        df = df.filter(
            (col('power_output').isNotNull()) &
            (col('power_output') >= 0) &
            (col('data_quality') == 'good')
        )
        
        if 'irradiance' in df.columns:
            df = df.filter(
                (col('irradiance').isNull()) |
                (col('irradiance') >= 0) |
                ((col('hour') >= 6) & (col('hour') <= 18))
            )
        
        valid_count = df.count()
        invalid_count = initial_count - valid_count
        
        if invalid_count > 0:
            logger.warning(f"Filtered out {invalid_count} invalid power records ({invalid_count/initial_count*100:.2f}%)")
        
        return df

    def calculate_integration(self, df, time_col='data_time', value_col='power_output'):
        logger.info(f"Calculating energy integration from {value_col}")
        
        window_spec = Window.partitionBy('station_id').orderBy(time_col)
        
        df_with_lag = df.withColumn(
            'prev_time',
            lag(col(time_col)).over(window_spec)
        ).withColumn(
            'prev_power',
            lag(col(value_col)).over(window_spec)
        )
        
        df_with_energy = df_with_lag.withColumn(
            'time_diff_hours',
            (unix_timestamp(col(time_col)) - unix_timestamp(col('prev_time'))) / 3600
        ).withColumn(
            'avg_power',
            (col(value_col) + col('prev_power')) / 2
        ).withColumn(
            'energy_kwh',
            when(
                (col('time_diff_hours') > 0) & (col('time_diff_hours') <= 1),
                col('avg_power') * col('time_diff_hours')
            ).otherwise(col(value_col) / 12)
        )
        
        return df_with_energy

    def aggregate_by_hour(self, df):
        logger.info("Aggregating power data by hour")
        
        df = self.normalize_power_units(df)
        df = self.validate_power_data(df)
        
        result = df.groupBy(
            col('station_id'),
            date_format(col('data_time'), 'yyyy-MM-dd').alias('date'),
            hour(col('data_time')).alias('hour')
        ).agg(
            round(sum('power_output') / count('*') * 12, 4).alias('total_power'),
            round(avg('power_output'), 4).alias('avg_power'),
            round(max('power_output'), 4).alias('max_power'),
            round(min('power_output'), 4).alias('min_power'),
            count('*').alias('record_count'),
            round(stddev('power_output'), 4).alias('std_power')
        ).orderBy('station_id', 'date', 'hour')
        
        return result

    def aggregate_by_day(self, df):
        logger.info("Aggregating power data by day")
        
        df = self.normalize_power_units(df)
        df = self.validate_power_data(df)
        
        hourly_agg = self.aggregate_by_hour(df)
        
        result = hourly_agg.groupBy(
            col('station_id'),
            col('date')
        ).agg(
            round(sum('total_power'), 4).alias('total_power'),
            round(avg('avg_power'), 4).alias('avg_power'),
            round(max('max_power'), 4).alias('max_power'),
            round(min('min_power'), 4).alias('min_power'),
            sum('record_count').alias('record_count'),
            count('*').alias('hourly_points')
        ).orderBy('station_id', 'date')
        
        return result

    def aggregate_by_station(self, df, start_date=None, end_date=None):
        logger.info("Aggregating power data by station")
        
        df = self.normalize_power_units(df)
        df = self.validate_power_data(df)
        
        result = df.groupBy(col('station_id')).agg(
            round(sum('power_output') / count('*') * 12, 4).alias('total_power'),
            round(avg('power_output'), 4).alias('avg_power'),
            round(max('power_output'), 4).alias('peak_power'),
            count('*').alias('record_count')
        ).orderBy('total_power', ascending=False)
        
        return result

    def calculate_efficiency(self, df_panel, df_inverter):
        logger.info("Calculating system efficiency")
        
        df_panel = self.normalize_power_units(df_panel, ['power_output'])
        df_inverter = self.normalize_power_units(df_inverter, ['active_power'])
        
        panel_agg = df_panel.groupBy('station_id', 'data_time').agg(
            sum('power_output').alias('panel_total_power')
        )
        
        inverter_agg = df_inverter.groupBy('station_id', 'data_time').agg(
            sum('active_power').alias('inverter_output_power')
        )
        
        efficiency_df = panel_agg.join(
            inverter_agg,
            on=['station_id', 'data_time'],
            how='inner'
        ).withColumn(
            'efficiency',
            when(
                (col('panel_total_power') > 0.1) & 
                (col('inverter_output_power') >= 0) &
                (col('inverter_output_power') <= col('panel_total_power') * 1.1),
                round((col('inverter_output_power') / col('panel_total_power')) * 100, 2)
            ).otherwise(None)
        ).filter(col('efficiency').isNotNull())
        
        return efficiency_df

    def calculate_loss_analysis(self, df):
        logger.info("Calculating loss analysis")
        
        result = df.groupBy('station_id').agg(
            sum(when(col('data_quality') == 'suspect', col('power_output')).otherwise(0)).alias('quality_loss'),
            avg('power_output').alias('avg_output')
        ).withColumn(
            'loss_rate',
            (col('quality_loss') / (col('avg_output') * count('*'))) * 100
        ).na.fill(0)
        
        return result

    def get_daily_trend(self, df, station_id=None):
        logger.info("Getting daily power trend")
        
        if station_id and station_id != 'all':
            df = df.filter(col('station_id') == station_id)
        
        daily_df = df.groupBy(
            date_format(col('data_time'), 'yyyy-MM-dd').alias('date')
        ).agg(
            sum('power_output').alias('total_power')
        ).orderBy('date')
        
        return daily_df

    def get_hourly_distribution(self, df):
        logger.info("Getting hourly power distribution")
        
        hourly_df = df.groupBy(
            hour(col('data_time')).alias('hour')
        ).agg(
            avg('power_output').alias('avg_power'),
            sum('power_output').alias('total_power')
        ).orderBy('hour')
        
        return hourly_df

    def compare_with_target(self, df, target_power):
        logger.info("Comparing actual power with target")
        
        daily_actual = self.aggregate_by_day(df)
        comparison = daily_actual.withColumn(
            'target_power', lit(target_power)
        ).withColumn(
            'completion_rate',
            (col('total_power') / col('target_power')) * 100
        )
        
        return comparison

    def save_aggregation_results(self, df, table_name, mode='overwrite'):
        logger.info(f"Saving aggregation results to {table_name}")
        df.write.mode(mode).saveAsTable(table_name)
        logger.info(f"Saved {df.count()} records to {table_name}")

    def run_daily_aggregation(self, date=None):
        if not date:
            date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        logger.info(f"Running daily aggregation for {date}")
        
        df_panel = self.load_cleaned_data('pv_panel_cleaned', 
                                          start_date=f"{date} 00:00:00", 
                                          end_date=f"{date} 23:59:59")
        
        hourly_df = self.aggregate_by_hour(df_panel)
        self.save_aggregation_results(hourly_df, 'pv_power_hourly', mode='append')
        
        daily_df = self.aggregate_by_day(df_panel)
        self.save_aggregation_results(daily_df, 'pv_power_daily', mode='append')
        
        return {
            'date': date,
            'hourly_records': hourly_df.count(),
            'daily_records': daily_df.count()
        }

    def get_power_stats(self, start_date, end_date, station_id='all', use_integration=True):
        logger.info(f"Getting power stats from {start_date} to {end_date}, use_integration: {use_integration}")
        
        df = self.load_cleaned_data('pv_panel_cleaned', start_date, end_date)
        
        if station_id != 'all':
            df = df.filter(col('station_id') == station_id)
        
        df = self.normalize_power_units(df)
        df = self.validate_power_data(df)
        
        if use_integration and df.count() > 100:
            df_with_energy = self.calculate_integration(df)
            stats = df_with_energy.agg(
                round(sum('energy_kwh'), 2).alias('total_power'),
                round(avg('power_output'), 2).alias('avg_power'),
                round(max('power_output'), 2).alias('peak_power'),
                count('*').alias('record_count')
            ).first()
        else:
            daily_df = self.aggregate_by_day(df)
            stats = daily_df.agg(
                round(sum('total_power'), 2).alias('total_power'),
                round(avg('avg_power'), 2).alias('avg_power'),
                round(max('max_power'), 2).alias('peak_power'),
                sum('record_count').alias('record_count')
            ).first()
        
        total_power_kwh = float(stats['total_power'] or 0)
        
        return {
            'total_power': total_power_kwh,
            'total_power_mwh': round(total_power_kwh * KWH_TO_MWH, 2),
            'avg_power': float(stats['avg_power'] or 0),
            'peak_power': float(stats['peak_power'] or 0),
            'record_count': int(stats['record_count'] or 0),
            'unit': 'kWh',
            'calculation_method': 'integration' if use_integration else 'daily_aggregation'
        }

    def close(self):
        if self.spark:
            self.spark.stop()

if __name__ == "__main__":
    aggregator = PowerAggregator()
    try:
        result = aggregator.run_daily_aggregation()
        print(json.dumps(result, indent=2))
    finally:
        aggregator.close()

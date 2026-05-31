from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, when, count, isnan, isnull, mean, stddev, 
    to_timestamp, date_format, lit, udf, abs,
    lag, unix_timestamp, coalesce, greatest, least,
    hour, dayofweek, month, year, abs as _abs
)
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType, IntegerType, StringType, BooleanType
import logging
from datetime import datetime
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PHYSICAL_BOUNDS = {
    'power_output': {'min': 0, 'max': 5000, 'unit': 'W'},
    'voltage': {'min': 0, 'max': 1500, 'unit': 'V'},
    'current': {'min': 0, 'max': 100, 'unit': 'A'},
    'active_power': {'min': 0, 'max': 5000, 'unit': 'kW'},
    'reactive_power': {'min': -2000, 'max': 2000, 'unit': 'kVar'},
    'temperature': {'min': -40, 'max': 120, 'unit': '°C'},
    'irradiance': {'min': 0, 'max': 1500, 'unit': 'W/m²'},
    'frequency': {'min': 45, 'max': 65, 'unit': 'Hz'},
    'efficiency': {'min': 0, 'max': 100, 'unit': '%'},
    'humidity': {'min': 0, 'max': 100, 'unit': '%'},
    'wind_speed': {'min': 0, 'max': 100, 'unit': 'm/s'},
    'pressure': {'min': 800, 'max': 1100, 'unit': 'hPa'}
}

JUMP_DETECTION_THRESHOLDS = {
    'power_output': 0.8,
    'voltage': 0.5,
    'current': 0.6,
    'temperature': 20,
    'irradiance': 800
}

IRRADIANCE_POWER_COEFFICIENT = 0.0045
IRRADIANCE_CORRELATION_THRESHOLD = 0.7

ZERO_DRIFT_THRESHOLD = 0.01
NEGATIVE_VALUE_THRESHOLD = -0.01

class PVDataCleaner:
    def __init__(self, spark=None, config=None):
        self.spark = spark or SparkSession.builder \
            .appName("PVDataCleaning") \
            .config("spark.sql.session.timeZone", "Asia/Shanghai") \
            .enableHiveSupport() \
            .getOrCreate()
        self.config = config or {}
        self.cleaning_stats = {}

    def load_data(self, table_name, start_date=None, end_date=None):
        logger.info(f"Loading data from {table_name}")
        query = f"SELECT * FROM {table_name}"
        conditions = []
        
        if start_date:
            conditions.append(f"data_time >= '{start_date}'")
        if end_date:
            conditions.append(f"data_time <= '{end_date}'")
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        df = self.spark.sql(query)
        logger.info(f"Loaded {df.count()} records")
        return df

    def remove_duplicates(self, df, subset=None):
        initial_count = df.count()
        df_clean = df.dropDuplicates(subset=subset)
        final_count = df_clean.count()
        removed = initial_count - final_count
        self.cleaning_stats['duplicates_removed'] = removed
        logger.info(f"Removed {removed} duplicate records")
        return df_clean

    def handle_missing_values(self, df, strategy='impute'):
        missing_stats = {}
        numeric_cols = [f.name for f in df.schema.fields if isinstance(f.dataType, (DoubleType, IntegerType))]
        
        for col_name in numeric_cols:
            missing_count = df.filter(col(col_name).isNull() | isnan(col(col_name))).count()
            missing_stats[col_name] = missing_count
            
            if missing_count > 0 and strategy == 'impute':
                mean_val = df.select(mean(col(col_name))).first()[0]
                df = df.withColumn(col_name, when(isnull(col(col_name)) | isnan(col(col_name)), mean_val).otherwise(col(col_name)))
                logger.info(f"Imputed {missing_count} missing values in {col_name} with mean {mean_val:.2f}")
        
        self.cleaning_stats['missing_values'] = missing_stats
        return df

    def remove_outliers(self, df, columns=None, threshold=3.0):
        if columns is None:
            columns = [f.name for f in df.schema.fields if isinstance(f.dataType, (DoubleType, IntegerType))]
        
        outlier_stats = {}
        
        for col_name in columns:
            stats = df.select(mean(col(col_name)).alias('mean'), stddev(col(col_name)).alias('std')).first()
            mean_val, std_val = stats['mean'], stats['std']
            
            if std_val and std_val > 0:
                lower_bound = mean_val - threshold * std_val
                upper_bound = mean_val + threshold * std_val
                
                initial_count = df.count()
                df = df.filter((col(col_name) >= lower_bound) & (col(col_name) <= upper_bound))
                removed = initial_count - df.count()
                outlier_stats[col_name] = removed
                logger.info(f"Removed {removed} outliers in {col_name} (bounds: {lower_bound:.2f}, {upper_bound:.2f})")
        
        self.cleaning_stats['outliers_removed'] = outlier_stats
        return df

    def standardize_formats(self, df):
        if 'data_time' in df.columns:
            df = df.withColumn('data_time', to_timestamp(col('data_time')))
        
        if 'station_id' in df.columns:
            df = df.withColumn('station_id', col('station_id').cast(StringType()))
        
        if 'device_id' in df.columns:
            df = df.withColumn('device_id', col('device_id').cast(StringType()))
        
        logger.info("Standardized data formats")
        return df

    def validate_data(self, df):
        validation_results = {
            'total_records': df.count(),
            'null_check': {},
            'range_check': {}
        }
        
        power_cols = ['active_power', 'reactive_power', 'power_output']
        for col_name in power_cols:
            if col_name in df.columns:
                invalid = df.filter(col(col_name) < 0).count()
                validation_results['range_check'][col_name] = invalid
        
        self.cleaning_stats['validation'] = validation_results
        logger.info(f"Validation complete: {json.dumps(validation_results, indent=2)}")
        return df

    def check_physical_bounds(self, df):
        logger.info("Checking physical bounds for all numeric columns")
        
        bounds_stats = {}
        
        for col_name, bounds in PHYSICAL_BOUNDS.items():
            if col_name in df.columns:
                initial_count = df.count()
                
                df = df.withColumn(
                    f'{col_name}_in_bounds',
                    (col(col_name).isNotNull()) &
                    (~isnan(col(col_name))) &
                    (col(col_name) >= bounds['min']) &
                    (col(col_name) <= bounds['max'])
                )
                
                out_of_bounds = df.filter(~col(f'{col_name}_in_bounds')).count()
                bounds_stats[col_name] = {
                    'out_of_bounds': out_of_bounds,
                    'bounds': bounds
                }
                
                if out_of_bounds > 0:
                    logger.warning(f"  - {col_name}: {out_of_bounds} records out of bounds [{bounds['min']}, {bounds['max']}] {bounds['unit']}")
        
        self.cleaning_stats['physical_bounds'] = bounds_stats
        
        for col_name in PHYSICAL_BOUNDS.keys():
            if f'{col_name}_in_bounds' in df.columns:
                df = df.drop(f'{col_name}_in_bounds')
        
        return df

    def detect_abnormal_jumps(self, df, columns=None):
        logger.info("Detecting abnormal jumps in time series data")
        
        if columns is None:
            columns = list(JUMP_DETECTION_THRESHOLDS.keys())
        
        jump_stats = {}
        
        for col_name in columns:
            if col_name in df.columns and 'device_id' in df.columns and 'data_time' in df.columns:
                window_spec = Window.partitionBy('device_id').orderBy('data_time')
                
                df = df.withColumn(
                    f'prev_{col_name}',
                    lag(col(col_name)).over(window_spec)
                ).withColumn(
                    f'prev_time',
                    lag(col('data_time')).over(window_spec)
                )
                
                threshold = JUMP_DETECTION_THRESHOLDS[col_name]
                
                if threshold < 1:
                    df = df.withColumn(
                        f'{col_name}_jump_ratio',
                        when(
                            col(f'prev_{col_name}') > 0,
                            abs(col(col_name) - col(f'prev_{col_name}')) / col(f'prev_{col_name}')
                        ).otherwise(0)
                    )
                    df = df.withColumn(
                        f'{col_name}_abnormal_jump',
                        col(f'{col_name}_jump_ratio') > threshold
                    )
                else:
                    df = df.withColumn(
                        f'{col_name}_jump_abs',
                        abs(col(col_name) - col(f'prev_{col_name}'))
                    )
                    df = df.withColumn(
                        f'{col_name}_abnormal_jump',
                        col(f'{col_name}_jump_abs') > threshold
                    )
                
                abnormal_count = df.filter(col(f'{col_name}_abnormal_jump')).count()
                jump_stats[col_name] = {
                    'abnormal_count': abnormal_count,
                    'threshold': threshold
                }
                
                if abnormal_count > 0:
                    logger.warning(f"  - {col_name}: {abnormal_count} abnormal jumps detected")
        
        self.cleaning_stats['abnormal_jumps'] = jump_stats
        
        return df

    def check_irradiance_power_correlation(self, df):
        logger.info("Checking irradiance-power correlation")
        
        if not all(col_name in df.columns for col_name in ['irradiance', 'power_output', 'data_time']):
            logger.info("  - Required columns not found, skipping correlation check")
            return df
        
        df = df.withColumn(
            'hour',
            hour(col('data_time'))
        ).withColumn(
            'is_daytime',
            (col('hour') >= 6) & (col('hour') <= 18)
        )
        
        df = df.withColumn(
            'expected_power',
            when(
                col('is_daytime') & (col('irradiance') > 0),
                col('irradiance') * IRRADIANCE_POWER_COEFFICIENT
            ).otherwise(0)
        ).withColumn(
            'power_deviation_ratio',
            when(
                col('expected_power') > 10,
                abs(col('power_output') - col('expected_power')) / col('expected_power')
            ).otherwise(0)
        ).withColumn(
            'irradiance_power_mismatch',
            (col('power_deviation_ratio') > (1 - IRRADIANCE_CORRELATION_THRESHOLD)) &
            (col('expected_power') > 10)
        )
        
        mismatch_count = df.filter(col('irradiance_power_mismatch')).count()
        self.cleaning_stats['irradiance_correlation'] = {
            'mismatch_count': mismatch_count,
            'threshold': IRRADIANCE_CORRELATION_THRESHOLD
        }
        
        if mismatch_count > 0:
            logger.warning(f"  - {mismatch_count} records with irradiance-power mismatch")
        
        return df

    def detect_zero_drift(self, df, columns=None):
        logger.info("Detecting zero drift in sensor readings")
        
        if columns is None:
            columns = ['power_output', 'active_power', 'voltage', 'current']
        
        drift_stats = {}
        
        for col_name in columns:
            if col_name in df.columns and 'device_id' in df.columns and 'data_time' in df.columns:
                window_spec = Window.partitionBy('device_id').orderBy('data_time').rowsBetween(-5, 5)
                
                df = df.withColumn(
                    f'{col_name}_rolling_mean',
                    mean(col(col_name)).over(window_spec)
                )
                
                df = df.withColumn(
                    f'{col_name}_zero_drift',
                    (abs(col(f'{col_name}_rolling_mean')) < ZERO_DRIFT_THRESHOLD) &
                    (col(col_name) != 0) &
                    (col('irradiance') > 100 if 'irradiance' in df.columns else lit(True))
                )
                
                drift_count = df.filter(col(f'{col_name}_zero_drift')).count()
                drift_stats[col_name] = {
                    'drift_count': drift_count,
                    'threshold': ZERO_DRIFT_THRESHOLD
                }
                
                if drift_count > 0:
                    logger.warning(f"  - {col_name}: {drift_count} records with possible zero drift")
        
        self.cleaning_stats['zero_drift'] = drift_stats
        
        return df

    def check_negative_values(self, df):
        logger.info("Checking for unexpected negative values")
        
        negative_columns = ['power_output', 'active_power', 'irradiance', 'voltage']
        negative_stats = {}
        
        for col_name in negative_columns:
            if col_name in df.columns:
                df = df.withColumn(
                    f'{col_name}_negative',
                    col(col_name) < NEGATIVE_VALUE_THRESHOLD
                )
                
                negative_count = df.filter(col(f'{col_name}_negative')).count()
                negative_stats[col_name] = negative_count
                
                if negative_count > 0:
                    logger.warning(f"  - {col_name}: {negative_count} unexpected negative values")
        
        self.cleaning_stats['negative_values'] = negative_stats
        
        return df

    def check_time_continuity(self, df):
        logger.info("Checking time continuity for each device")
        
        if 'device_id' not in df.columns or 'data_time' not in df.columns:
            return df
        
        window_spec = Window.partitionBy('device_id').orderBy('data_time')
        
        df = df.withColumn(
            'prev_data_time',
            lag(col('data_time')).over(window_spec)
        ).withColumn(
            'time_diff_minutes',
            (unix_timestamp(col('data_time')) - unix_timestamp(col('prev_data_time'))) / 60
        )
        
        df = df.withColumn(
            'time_gap',
            (col('time_diff_minutes') > 30) & col('prev_data_time').isNotNull()
        )
        
        gap_count = df.filter(col('time_gap')).count()
        self.cleaning_stats['time_continuity'] = {
            'gap_count': gap_count,
            'max_gap_minutes': 30
        }
        
        if gap_count > 0:
            logger.warning(f"  - {gap_count} time gaps detected (>30 minutes)")
        
        return df

    def check_device_status_anomaly(self, df):
        logger.info("Checking for device status anomalies")
        
        if 'status' not in df.columns:
            return df
        
        df = df.withColumn(
            'status_anomaly',
            (col('status') == 'fault') & 
            (col('power_output') > 100 if 'power_output' in df.columns else lit(False))
        )
        
        anomaly_count = df.filter(col('status_anomaly')).count()
        self.cleaning_stats['device_status_anomaly'] = {
            'anomaly_count': anomaly_count
        }
        
        if anomaly_count > 0:
            logger.warning(f"  - {anomaly_count} devices show status anomaly (fault but producing power)")
        
        return df

    def enhanced_anomaly_filter(self, df, filter_mode='flag'):
        logger.info(f"Applying enhanced anomaly filter (mode: {filter_mode})")
        
        anomaly_flags = []
        
        for col_name in PHYSICAL_BOUNDS.keys():
            if f'{col_name}_in_bounds' in df.columns:
                anomaly_flags.append(col(f'{col_name}_in_bounds'))
        
        for col_name in JUMP_DETECTION_THRESHOLDS.keys():
            if f'{col_name}_abnormal_jump' in df.columns:
                anomaly_flags.append(~col(f'{col_name}_abnormal_jump'))
        
        if 'irradiance_power_mismatch' in df.columns:
            anomaly_flags.append(~col('irradiance_power_mismatch'))
        
        for col_name in ['power_output', 'active_power']:
            if f'{col_name}_zero_drift' in df.columns:
                anomaly_flags.append(~col(f'{col_name}_zero_drift'))
        
        for col_name in ['power_output', 'active_power', 'irradiance']:
            if f'{col_name}_negative' in df.columns:
                anomaly_flags.append(~col(f'{col_name}_negative'))
        
        if 'status_anomaly' in df.columns:
            anomaly_flags.append(~col('status_anomaly'))
        
        if anomaly_flags:
            all_valid = anomaly_flags[0]
            for flag in anomaly_flags[1:]:
                all_valid = all_valid & flag
            
            df = df.withColumn('enhanced_quality', when(all_valid, 'good').otherwise('anomaly'))
            
            anomaly_count = df.filter(col('enhanced_quality') == 'anomaly').count()
            self.cleaning_stats['enhanced_filter'] = {
                'anomaly_count': anomaly_count,
                'filter_mode': filter_mode
            }
            
            if filter_mode == 'remove':
                df = df.filter(col('enhanced_quality') == 'good')
                logger.info(f"  - Removed {anomaly_count} anomalous records")
            else:
                logger.info(f"  - Flagged {anomaly_count} anomalous records")
        
        return df

    def add_data_quality_flag(self, df):
        quality_conditions = []
        
        if 'active_power' in df.columns:
            quality_conditions.append(col('active_power') >= 0)
        
        if 'power_output' in df.columns:
            quality_conditions.append(col('power_output') >= 0)
        
        if 'irradiance' in df.columns:
            quality_conditions.append(col('irradiance') >= 0)
        
        if 'temperature' in df.columns:
            quality_conditions.append((col('temperature') >= -40) & (col('temperature') <= 85))
        
        if 'enhanced_quality' in df.columns:
            quality_conditions.append(col('enhanced_quality') == 'good')
        
        if quality_conditions:
            all_conditions = quality_conditions[0]
            for cond in quality_conditions[1:]:
                all_conditions = all_conditions & cond
            df = df.withColumn('data_quality', when(all_conditions, 'good').otherwise('suspect'))
        
        return df

    def clean_intermediate_columns(self, df):
        logger.info("Cleaning intermediate calculation columns")
        
        columns_to_drop = []
        for col_name in df.columns:
            if any(col_name.startswith(prefix) for prefix in [
                'prev_', 'jump_', '_in_bounds', '_abnormal_jump',
                '_negative', '_zero_drift', '_rolling_mean',
                'expected_power', 'power_deviation_ratio',
                'irradiance_power_mismatch', 'is_daytime', 'hour',
                'prev_data_time', 'time_diff_minutes', 'time_gap',
                'status_anomaly', 'enhanced_quality'
            ]):
                columns_to_drop.append(col_name)
        
        if columns_to_drop:
            df = df.drop(*columns_to_drop)
            logger.info(f"  - Dropped {len(columns_to_drop)} intermediate columns")
        
        return df

    def clean_panel_data(self, start_date=None, end_date=None, save_to_hive=True, filter_mode='flag'):
        logger.info("Starting PV panel data cleaning with enhanced anomaly detection")
        self.cleaning_stats = {'start_time': datetime.now().isoformat()}
        
        df = self.load_data('pv_panel_raw', start_date, end_date)
        
        df = self.remove_duplicates(df, subset=['device_id', 'data_time'])
        df = self.handle_missing_values(df)
        
        df = self.check_physical_bounds(df)
        df = self.detect_abnormal_jumps(df, columns=['power_output', 'voltage', 'current', 'temperature'])
        df = self.check_irradiance_power_correlation(df)
        df = self.detect_zero_drift(df, columns=['power_output', 'voltage', 'current'])
        df = self.check_negative_values(df)
        df = self.check_time_continuity(df)
        df = self.check_device_status_anomaly(df)
        
        df = self.enhanced_anomaly_filter(df, filter_mode=filter_mode)
        df = self.remove_outliers(df, columns=['power_output', 'voltage', 'current'])
        df = self.standardize_formats(df)
        df = self.validate_data(df)
        df = self.add_data_quality_flag(df)
        
        initial_count = df.count()
        df = self.clean_intermediate_columns(df)
        final_count = df.count()
        
        self.cleaning_stats['initial_count'] = initial_count
        self.cleaning_stats['columns_cleaned'] = initial_count - final_count
        
        if save_to_hive:
            df.write.mode('overwrite').partitionBy('dt').saveAsTable('pv_panel_cleaned')
            logger.info("Saved cleaned panel data to Hive table: pv_panel_cleaned")
        
        self.cleaning_stats['end_time'] = datetime.now().isoformat()
        self.cleaning_stats['final_record_count'] = df.count()
        
        good_count = df.filter(col('data_quality') == 'good').count()
        suspect_count = df.count() - good_count
        self.cleaning_stats['quality_distribution'] = {
            'good': good_count,
            'suspect': suspect_count,
            'good_percentage': round(good_count / df.count() * 100, 2) if df.count() > 0 else 0
        }
        
        return df, self.cleaning_stats

    def clean_inverter_data(self, start_date=None, end_date=None, save_to_hive=True, filter_mode='flag'):
        logger.info("Starting inverter data cleaning with enhanced anomaly detection")
        self.cleaning_stats = {'start_time': datetime.now().isoformat()}
        
        df = self.load_data('pv_inverter_raw', start_date, end_date)
        
        df = self.remove_duplicates(df, subset=['inverter_id', 'data_time'])
        df = self.handle_missing_values(df)
        
        df = self.check_physical_bounds(df)
        df = self.detect_abnormal_jumps(df, columns=['active_power', 'efficiency', 'temperature', 'voltage'])
        df = self.detect_zero_drift(df, columns=['active_power'])
        df = self.check_negative_values(df)
        df = self.check_time_continuity(df)
        df = self.check_device_status_anomaly(df)
        
        df = self.enhanced_anomaly_filter(df, filter_mode=filter_mode)
        df = self.remove_outliers(df, columns=['active_power', 'efficiency', 'temperature'])
        df = self.standardize_formats(df)
        df = self.validate_data(df)
        df = self.add_data_quality_flag(df)
        
        initial_count = df.count()
        df = self.clean_intermediate_columns(df)
        final_count = df.count()
        
        self.cleaning_stats['initial_count'] = initial_count
        self.cleaning_stats['columns_cleaned'] = initial_count - final_count
        
        if save_to_hive:
            df.write.mode('overwrite').partitionBy('dt').saveAsTable('pv_inverter_cleaned')
            logger.info("Saved cleaned inverter data to Hive table: pv_inverter_cleaned")
        
        self.cleaning_stats['end_time'] = datetime.now().isoformat()
        self.cleaning_stats['final_record_count'] = df.count()
        
        good_count = df.filter(col('data_quality') == 'good').count()
        suspect_count = df.count() - good_count
        self.cleaning_stats['quality_distribution'] = {
            'good': good_count,
            'suspect': suspect_count,
            'good_percentage': round(good_count / df.count() * 100, 2) if df.count() > 0 else 0
        }
        
        return df, self.cleaning_stats

    def run_full_cleaning(self, start_date=None, end_date=None, filter_mode='flag'):
        logger.info(f"Starting full data cleaning pipeline (filter_mode: {filter_mode})")
        
        panel_df, panel_stats = self.clean_panel_data(start_date, end_date, filter_mode=filter_mode)
        inverter_df, inverter_stats = self.clean_inverter_data(start_date, end_date, filter_mode=filter_mode)
        
        full_stats = {
            'panel_data': panel_stats,
            'inverter_data': inverter_stats,
            'total_cleaned_records': panel_stats.get('final_record_count', 0) + inverter_stats.get('final_record_count', 0),
            'filter_mode': filter_mode
        }
        
        logger.info(f"Full cleaning complete: {json.dumps(full_stats, indent=2, default=str)}")
        return full_stats

    def close(self):
        if self.spark:
            self.spark.stop()

if __name__ == "__main__":
    cleaner = PVDataCleaner()
    try:
        stats = cleaner.run_full_cleaning()
        print(json.dumps(stats, indent=2))
    finally:
        cleaner.close()

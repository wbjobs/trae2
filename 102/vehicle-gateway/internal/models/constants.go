package models

const (
	ProtocolJT808    = "JT808"
	ProtocolGB32960  = "GB32960"
	ProtocolMQTT     = "MQTT"
	ProtocolHTTP     = "HTTP"

	MsgTypeLocation  = "LOCATION"
	MsgTypeHeartbeat = "HEARTBEAT"
	MsgTypeLogin     = "LOGIN"
	MsgTypeLogout    = "LOGOUT"
	MsgTypeAlarm     = "ALARM"
	MsgTypeInfo      = "INFO"

	DeviceStatusNormal  = 1
	DeviceStatusOffline = 2
	DeviceStatusFault   = 3

	OnlineStatusOffline = 0
	OnlineStatusOnline  = 1
	OnlineStatusBusy    = 2

	RegionNorth = "north"
	RegionSouth = "south"
	RegionEast  = "east"
	RegionWest  = "west"
	RegionCentral = "central"

	CacheKeyDevicePrefix      = "device:"
	CacheKeyOnlinePrefix      = "online:"
	CacheKeyOfflineQueue      = "offline:queue"
	CacheKeyRateLimitPrefix   = "ratelimit:"
	CacheKeyRoutePrefix       = "route:"
	CacheKeyLockPrefix        = "lock:"

	DefaultBatchSize      = 100
	DefaultFlushInterval  = 5
	DefaultQueueSize      = 10000
	DefaultWorkerCount    = 10

	CurrentVersion = "1.0.0"
)

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { SceneLoader } from './core/SceneLoader'
import { TopologyCalculator } from './core/TopologyCalculator'
import { InteractionController, InteractionMode, MeasureResult } from './core/InteractionController'
import { LayerManager } from './core/LayerManager'
import { DataService } from './services/DataService'
import { FaultSimulator, FaultType, FaultEvent, SimulationResult } from './core/FaultSimulator'
import { PathRoaming, RoamingState } from './core/PathRoaming'
import { LODLoader } from './core/LODLoader'
import { Pipeline, Device, Layer, SceneConfig, Point3D } from './types'
import { Toolbar } from './components/Toolbar'
import { LayerPanel } from './components/LayerPanel'
import { DevicePopup } from './components/DevicePopup'
import { PipelinePopup } from './components/PipelinePopup'
import { AlarmPanel } from './components/AlarmPanel'
import { FaultSimulation } from './components/FaultSimulation'
import { PathRoamingPanel } from './components/PathRoamingPanel'

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneLoaderRef = useRef<SceneLoader | null>(null)
  const interactionControllerRef = useRef<InteractionController | null>(null)
  const topologyCalculatorRef = useRef<TopologyCalculator | null>(null)
  const layerManagerRef = useRef<LayerManager | null>(null)
  const dataServiceRef = useRef<DataService | null>(null)
  const faultSimulatorRef = useRef<FaultSimulator | null>(null)
  const pathRoamingRef = useRef<PathRoaming | null>(null)
  const lodLoaderRef = useRef<LODLoader | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [layers, setLayers] = useState<Layer[]>([])
  const [currentMode, setCurrentMode] = useState<InteractionMode>('orbit')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [alarms, setAlarms] = useState<any[]>([])
  const [measures, setMeasures] = useState<MeasureResult[]>([])
  const [stats, setStats] = useState({
    totalPipelines: 0,
    totalDevices: 0,
    runningDevices: 0,
    alarmCount: 0,
    warningCount: 0
  })
  const [activeFaults, setActiveFaults] = useState<FaultEvent[]>([])
  const [isFaultPanelOpen, setIsFaultPanelOpen] = useState(false)
  const [isRoamingPanelOpen, setIsRoamingPanelOpen] = useState(false)
  const [roamingState, setRoamingState] = useState<RoamingState | null>(null)
  const [currentPathName, setCurrentPathName] = useState<string | null>(null)
  const [performanceStats, setPerformanceStats] = useState({
    fps: 60,
    visibleObjects: 0,
    totalObjects: 0
  })

  const sceneConfig: SceneConfig = {
    containerId: 'scene-container',
    backgroundColor: 0x1a1a2e,
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 0.8,
    cameraPosition: { x: 60, y: 60, z: 60 },
    cameraTarget: { x: 0, y: 0, z: 0 }
  }

  const initializeScene = useCallback(() => {
    if (!containerRef.current) return

    const dataService = new DataService({ baseUrl: 'http://localhost:8080' })
    dataServiceRef.current = dataService

    const sceneLoader = new SceneLoader(sceneConfig)
    sceneLoaderRef.current = sceneLoader

    const layerManager = new LayerManager(dataService, sceneLoader)
    layerManagerRef.current = layerManager

    const topologyCalculator = new TopologyCalculator()
    topologyCalculatorRef.current = topologyCalculator

    const interactionController = new InteractionController(
      sceneLoader.getCamera(),
      sceneLoader.getControls(),
      sceneLoader.getRenderer(),
      sceneLoader.scene
    )
    interactionControllerRef.current = interactionController

    const faultSimulator = new FaultSimulator(topologyCalculator)
    faultSimulatorRef.current = faultSimulator

    const pathRoaming = new PathRoaming(sceneLoader)
    pathRoamingRef.current = pathRoaming

    const lodLoader = new LODLoader(
      sceneLoader.scene,
      sceneLoader.getCamera()
    )
    lodLoaderRef.current = lodLoader

    layerManager.setOnLayersChangeCallback((updatedLayers) => {
      setLayers(updatedLayers)
    })

    interactionController.setOnSelectCallback((type, id) => {
      handleObjectSelect(type, id)
    })

    interactionController.setOnMeasureCompleteCallback((measure) => {
      setMeasures(prev => [...prev, measure])
    })

    faultSimulator.setOnFaultUpdateCallback((faults) => {
      setActiveFaults(faults)
      updateFaultVisualization(faults)
    })

    pathRoaming.setOnStateChangeCallback((state) => {
      setRoamingState(state)
      if (state) {
        const path = pathRoaming.getCurrentPath()
        setCurrentPathName(path?.name || null)
      } else {
        setCurrentPathName(null)
      }
    })

    lodLoader.setOnVisibilityChangeCallback((visibleIds, hiddenIds) => {
      const stats = lodLoader.getPerformanceStats()
      setPerformanceStats(prev => ({
        ...prev,
        visibleObjects: stats.visibleObjects,
        totalObjects: stats.totalObjects
      }))
    })

    sceneLoader.startAnimation()

    loadData(dataService, sceneLoader, layerManager, topologyCalculator, faultSimulator)
  }, [])

  const loadData = async (
    dataService: DataService,
    sceneLoader: SceneLoader,
    layerManager: LayerManager,
    topologyCalculator: TopologyCalculator,
    faultSimulator: FaultSimulator
  ) => {
    try {
      setLoadingProgress(20)
      const [loadedPipelines, loadedDevices, loadedLayers, loadedAlarms, loadedStats] = await Promise.all([
        dataService.getPipelines(),
        dataService.getDevices(),
        layerManager.loadLayers(),
        dataService.getAlarms(),
        dataService.getStatistics()
      ])

      setLoadingProgress(50)

      setPipelines(loadedPipelines)
      setDevices(loadedDevices)
      setLayers(loadedLayers)
      setAlarms(loadedAlarms)
      setStats(loadedStats)

      loadedPipelines.forEach(pipeline => {
        sceneLoader.createPipeline(pipeline)
      })

      setLoadingProgress(75)

      loadedDevices.forEach(device => {
        sceneLoader.createDevice(device)
      })

      setLoadingProgress(90)

      topologyCalculator.setData(loadedPipelines, loadedDevices)
      faultSimulator.setData(loadedPipelines, loadedDevices)

      if (lodLoaderRef.current) {
        loadedPipelines.forEach(pipeline => {
          const obj = sceneLoader.scene.getObjectByName(pipeline.id)
          if (obj) {
            lodLoaderRef.current!.registerObject(pipeline.id, 'pipeline', obj)
          }
        })
        loadedDevices.forEach(device => {
          const obj = sceneLoader.scene.getObjectByName(device.id)
          if (obj) {
            lodLoaderRef.current!.registerObject(device.id, 'device', obj)
          }
        })
      }

      setLoadingProgress(100)
      setIsLoading(false)

      dataService.subscribeToRealtimeData((data) => {
        console.log('Realtime data update:', data)
      })
    } catch (error) {
      console.error('Failed to load data:', error)
      setIsLoading(false)
    }
  }

  const updateFaultVisualization = (faults: FaultEvent[]) => {
    if (!sceneLoaderRef.current) return
    
    const faultPipelineIds = faults.map(f => f.pipelineId)
    sceneLoaderRef.current.setFaultPipelines(faultPipelineIds)
  }

  const handleObjectSelect = (type: 'pipeline' | 'device', id: string) => {
    if (sceneLoaderRef.current) {
      sceneLoaderRef.current.clearHighlight()
      sceneLoaderRef.current.highlightObject(type, id)
    }

    if (type === 'device') {
      const device = devices.find(d => d.id === id)
      if (device) {
        setSelectedDevice(device)
        setSelectedPipeline(null)
        updatePopupPosition(device.position)
      }
    } else {
      const pipeline = pipelines.find(p => p.id === id)
      if (pipeline) {
        setSelectedPipeline(pipeline)
        setSelectedDevice(null)
        const midPoint: Point3D = {
          x: (pipeline.startPoint.x + pipeline.endPoint.x) / 2,
          y: (pipeline.startPoint.y + pipeline.endPoint.y) / 2,
          z: (pipeline.startPoint.z + pipeline.endPoint.z) / 2
        }
        updatePopupPosition(midPoint)
      }
    }
  }

  const updatePopupPosition = (point: Point3D) => {
    if (sceneLoaderRef.current) {
      const screenPos = sceneLoaderRef.current.getScreenPosition(point)
      if (screenPos) {
        const popupWidth = 360
        const popupHeight = 500
        const windowWidth = window.innerWidth
        const windowHeight = window.innerHeight
        
        let x = screenPos.x + 20
        let y = screenPos.y - popupHeight / 2
        
        if (x + popupWidth > windowWidth - 20) {
          x = screenPos.x - popupWidth - 20
        }
        if (y < 80) {
          y = 80
        }
        if (y + popupHeight > windowHeight - 40) {
          y = windowHeight - popupHeight - 40
        }
        
        setPopupPosition({ x, y })
      }
    }
  }

  const updatePopupPositionLoop = useCallback(() => {
    if (selectedDevice) {
      updatePopupPosition(selectedDevice.position)
    } else if (selectedPipeline) {
      const midPoint: Point3D = {
        x: (selectedPipeline.startPoint.x + selectedPipeline.endPoint.x) / 2,
        y: (selectedPipeline.startPoint.y + selectedPipeline.endPoint.y) / 2,
        z: (selectedPipeline.startPoint.z + selectedPipeline.endPoint.z) / 2
      }
      updatePopupPosition(midPoint)
    }
    animationFrameRef.current = requestAnimationFrame(updatePopupPositionLoop)
  }, [selectedDevice, selectedPipeline])

  useEffect(() => {
    if (selectedDevice || selectedPipeline) {
      animationFrameRef.current = requestAnimationFrame(updatePopupPositionLoop)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [selectedDevice, selectedPipeline, updatePopupPositionLoop])

  const handleModeChange = (mode: InteractionMode) => {
    setCurrentMode(mode)
    if (interactionControllerRef.current) {
      interactionControllerRef.current.setMode(mode)
    }
  }

  const handleResetView = () => {
    if (interactionControllerRef.current) {
      interactionControllerRef.current.resetView()
    }
  }

  const handleFitView = () => {
    if (sceneLoaderRef.current && interactionControllerRef.current) {
      const allIds = [...pipelines.map(p => p.id), ...devices.map(d => d.id)]
      interactionControllerRef.current.fitViewToObjects(allIds)
    }
  }

  const handleToggleLayer = async (layerId: string) => {
    if (layerManagerRef.current) {
      await layerManagerRef.current.toggleLayer(layerId)
    }
  }

  const handleOpacityChange = async (layerId: string, opacity: number) => {
    if (layerManagerRef.current) {
      await layerManagerRef.current.setLayerOpacity(layerId, opacity)
    }
  }

  const handleShowAllLayers = async () => {
    if (layerManagerRef.current) {
      await layerManagerRef.current.showAllLayers()
    }
  }

  const handleHideAllLayers = async () => {
    if (layerManagerRef.current) {
      await layerManagerRef.current.hideAllLayers()
    }
  }

  const handleResetLayers = async () => {
    if (layerManagerRef.current) {
      await layerManagerRef.current.resetLayers()
    }
  }

  const handleClosePopup = () => {
    setSelectedDevice(null)
    setSelectedPipeline(null)
    if (sceneLoaderRef.current) {
      sceneLoaderRef.current.clearHighlight()
    }
  }

  const handleFocusOnObject = () => {
    if (!interactionControllerRef.current) return

    if (selectedDevice) {
      interactionControllerRef.current.focusOnPoint(selectedDevice.position)
    } else if (selectedPipeline) {
      const midPoint: Point3D = {
        x: (selectedPipeline.startPoint.x + selectedPipeline.endPoint.x) / 2,
        y: (selectedPipeline.startPoint.y + selectedPipeline.endPoint.y) / 2,
        z: (selectedPipeline.startPoint.z + selectedPipeline.endPoint.z) / 2
      }
      interactionControllerRef.current.focusOnPoint(midPoint)
    }
  }

  const handleAlarmClick = (alarm: any) => {
    handleObjectSelect(alarm.sourceType, alarm.sourceId)
  }

  const handleCreateFault = (pipelineId: string, type: FaultType, severity: number): FaultEvent => {
    if (!faultSimulatorRef.current) {
      throw new Error('FaultSimulator not initialized')
    }
    return faultSimulatorRef.current.createFault(pipelineId, type, severity)
  }

  const handleSimulateFault = (faultId: string): SimulationResult | null => {
    if (!faultSimulatorRef.current) {
      return null
    }
    return faultSimulatorRef.current.simulateFault(faultId)
  }

  const handleClearFault = (faultId: string) => {
    if (!faultSimulatorRef.current) {
      return
    }
    faultSimulatorRef.current.clearFault(faultId)
    setActiveFaults(faultSimulatorRef.current.getActiveFaults())
    updateFaultVisualization(faultSimulatorRef.current.getActiveFaults())
  }

  const handleStartRoaming = (pathId: string, loop: boolean): boolean => {
    if (!pathRoamingRef.current) {
      return false
    }
    return pathRoamingRef.current.startRoaming(pathId, loop)
  }

  const handleStopRoaming = () => {
    if (!pathRoamingRef.current) {
      return
    }
    pathRoamingRef.current.stopRoaming()
  }

  const handlePauseRoaming = () => {
    if (!pathRoamingRef.current) {
      return
    }
    pathRoamingRef.current.pauseRoaming()
  }

  const handleResumeRoaming = () => {
    if (!pathRoamingRef.current) {
      return
    }
    pathRoamingRef.current.resumeRoaming()
  }

  const handleSetRoamingSpeed = (speed: number) => {
    if (!pathRoamingRef.current) {
      return
    }
    pathRoamingRef.current.setSpeed(speed)
  }

  const getConnectedDevices = (deviceId: string): Device[] => {
    if (!topologyCalculatorRef.current) return []
    const connections = topologyCalculatorRef.current.getDeviceConnections(deviceId)
    return connections.connectedDevices
      .map(id => devices.find(d => d.id === id))
      .filter(Boolean) as Device[]
  }

  const getConnectedPipelines = (deviceId: string): Pipeline[] => {
    const device = devices.find(d => d.id === deviceId)
    if (!device) return []
    return device.connectedPipelines
      .map(id => pipelines.find(p => p.id === id))
      .filter(Boolean) as Pipeline[]
  }

  const getPipelineDevices = (pipelineId: string) => {
    if (!topologyCalculatorRef.current) return { startDevice: null, endDevice: null }
    return topologyCalculatorRef.current.getPipelineConnections(pipelineId)
  }

  useEffect(() => {
    initializeScene()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (sceneLoaderRef.current) {
        sceneLoaderRef.current.dispose()
      }
      if (interactionControllerRef.current) {
        interactionControllerRef.current.dispose()
      }
      if (pathRoamingRef.current) {
        pathRoamingRef.current.stopRoaming()
      }
    }
  }, [initializeScene])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case '1':
          handleModeChange('orbit')
          break
        case '2':
          handleModeChange('select')
          break
        case '3':
          handleModeChange('measure')
          break
        case 'r':
        case 'R':
          handleResetView()
          break
        case 'Escape':
          handleClosePopup()
          break
        case 'f':
        case 'F':
          setIsFaultPanelOpen(prev => !prev)
          break
        case 'p':
        case 'P':
          setIsRoamingPanelOpen(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const availablePipelineIds = pipelines.map(p => ({ id: p.id, name: p.name }))
  const availableRoamingPaths = pathRoamingRef.current?.getAvailablePaths() || []

  return (
    <div className="app-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <h2>正在加载3D场景...</h2>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p>{loadingProgress}% 完成</p>
          </div>
        </div>
      )}

      <Toolbar
        currentMode={currentMode}
        onModeChange={handleModeChange}
        onResetView={handleResetView}
        onFitView={handleFitView}
        stats={stats}
        onOpenFaultPanel={() => setIsFaultPanelOpen(true)}
        onOpenRoamingPanel={() => setIsRoamingPanelOpen(true)}
        activeFaults={activeFaults.length}
        isRoaming={!!roamingState}
      />

      <div className="main-content">
        <div
          id="scene-container"
          ref={containerRef}
          className="scene-container"
        />

        <div className="side-panels">
          <LayerPanel
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onOpacityChange={handleOpacityChange}
            onShowAll={handleShowAllLayers}
            onHideAll={handleHideAllLayers}
            onReset={handleResetLayers}
          />
          <AlarmPanel
            alarms={alarms}
            onAlarmClick={handleAlarmClick}
          />
        </div>
      </div>

      <FaultSimulation
        isOpen={isFaultPanelOpen}
        onClose={() => setIsFaultPanelOpen(false)}
        pipelineIds={availablePipelineIds}
        onCreateFault={handleCreateFault}
        onSimulateFault={handleSimulateFault}
        onClearFault={handleClearFault}
        activeFaults={activeFaults}
      />

      <PathRoamingPanel
        isOpen={isRoamingPanelOpen}
        onClose={() => setIsRoamingPanelOpen(false)}
        availablePaths={availableRoamingPaths}
        currentState={roamingState}
        currentPathName={currentPathName}
        onStartRoaming={handleStartRoaming}
        onStopRoaming={handleStopRoaming}
        onPauseRoaming={handlePauseRoaming}
        onResumeRoaming={handleResumeRoaming}
        onSetSpeed={handleSetRoamingSpeed}
      />

      {selectedDevice && (
        <div 
          className="popup-container dynamic"
          style={{ 
            position: 'fixed',
            left: popupPosition.x, 
            top: popupPosition.y,
            zIndex: 1000 
          }}
        >
          <DevicePopup
            device={selectedDevice}
            onClose={handleClosePopup}
            onFocus={handleFocusOnObject}
            connectedDevices={getConnectedDevices(selectedDevice.id)}
            connectedPipelines={getConnectedPipelines(selectedDevice.id)}
          />
        </div>
      )}

      {selectedPipeline && (
        <div 
          className="popup-container dynamic"
          style={{ 
            position: 'fixed',
            left: popupPosition.x, 
            top: popupPosition.y,
            zIndex: 1000 
          }}
        >
          <PipelinePopup
            pipeline={selectedPipeline}
            onClose={handleClosePopup}
            onFocus={handleFocusOnObject}
            startDevice={devices.find(d => d.id === getPipelineDevices(selectedPipeline.id).startDevice) || null}
            endDevice={devices.find(d => d.id === getPipelineDevices(selectedPipeline.id).endDevice) || null}
          />
        </div>
      )}

      {measures.length > 0 && (
        <div className="measure-panel">
          <div className="panel-header">
            <h3>测量结果 ({measures.length})</h3>
            <button 
              className="action-btn" 
              onClick={() => {
                setMeasures([])
                interactionControllerRef.current?.clearMeasures()
              }}
              title="清除全部"
            >
              🗑️
            </button>
          </div>
          <div className="measure-list">
            {measures.map((measure, index) => (
              <div key={measure.id} className="measure-item">
                <span className="measure-index">#{index + 1}</span>
                <span className="measure-distance">{measure.distance.toFixed(2)} m</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="status-bar">
        <div className="status-item">
          <span className="status-label">交互模式:</span>
          <span className="status-value">{getModeLabel(currentMode)}</span>
        </div>
        <div className="status-item">
          <span className="status-label">快捷键:</span>
          <span className="status-value">1-漫游 2-选择 3-测量 F-故障 P-路径 R-重置 ESC-关闭</span>
        </div>
        {measures.length > 0 && (
          <div className="status-item">
            <span className="status-label">测量:</span>
            <span className="status-value">{measures.length} 条记录</span>
          </div>
        )}
        {activeFaults.length > 0 && (
          <div className="status-item fault-status">
            <span className="status-label">故障:</span>
            <span className="status-value">{activeFaults.length} 个</span>
          </div>
        )}
        {roamingState && (
          <div className="status-item roaming-status">
            <span className="status-label">漫游:</span>
            <span className="status-value">{roamingState.isPaused ? '已暂停' : '播放中'}</span>
          </div>
        )}
        <div className="status-item">
          <span className="status-label">可见物体:</span>
          <span className="status-value">{performanceStats.visibleObjects}/{performanceStats.totalObjects}</span>
        </div>
      </div>
    </div>
  )
}

function getModeLabel(mode: InteractionMode): string {
  const labels: Record<InteractionMode, string> = {
    orbit: '漫游模式',
    select: '选择模式',
    measure: '测量模式',
    rotate: '旋转模式',
    pan: '平移模式'
  }
  return labels[mode]
}

export default App

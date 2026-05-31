import { describe, it, expect, beforeEach } from 'vitest'

describe('Chart Linkage Tests', () => {
  let linkedFilters

  beforeEach(() => {
    linkedFilters = {
      selectedDate: null,
      selectedFaultType: null,
      selectedLossType: null,
      selectedTimeSlot: null
    }
  })

  it('should initialize with no filters', () => {
    expect(linkedFilters.selectedDate).toBeNull()
    expect(linkedFilters.selectedFaultType).toBeNull()
    expect(linkedFilters.selectedLossType).toBeNull()
    expect(linkedFilters.selectedTimeSlot).toBeNull()
  })

  it('should set selected date on chart click', () => {
    const mockParams = {
      componentType: 'series',
      name: '2024-01-15'
    }

    if (mockParams.componentType === 'series') {
      linkedFilters.selectedDate = mockParams.name
    }

    expect(linkedFilters.selectedDate).toBe('2024-01-15')
  })

  it('should toggle fault type selection', () => {
    const faultType = '逆变器故障'
    
    linkedFilters.selectedFaultType = 
      linkedFilters.selectedFaultType === faultType ? null : faultType
    
    expect(linkedFilters.selectedFaultType).toBe('逆变器故障')
    
    linkedFilters.selectedFaultType = 
      linkedFilters.selectedFaultType === faultType ? null : faultType
    
    expect(linkedFilters.selectedFaultType).toBeNull()
  })

  it('should filter inverter data based on fault type', () => {
    const inverterData = [
      { name: 'INV-001', status: '正常' },
      { name: 'INV-002', status: '故障' },
      { name: 'INV-003', status: '告警' }
    ]

    const faultStatusMap = {
      '逆变器故障': '故障',
      '组件异常': '告警'
    }

    const filterInverterData = (filters => {
      if (!filters.selectedFaultType) return inverterData
      const targetStatus = faultStatusMap[filters.selectedFaultType]
      if (targetStatus) {
        return inverterData.filter(d => d.status === targetStatus)
      }
      return inverterData
    }

    linkedFilters.selectedFaultType = '逆变器故障'
    const filtered = filterInverterData(linkedFilters)
    expect(filtered.length).toBe(1)
    expect(filtered[0].status).toBe('故障')

    linkedFilters.selectedFaultType = '组件异常'
    const filtered2 = filterInverterData(linkedFilters)
    expect(filtered2.length).toBe(1)
    expect(filtered2[0].status).toBe('告警')

    linkedFilters.selectedFaultType = null
    const filtered3 = filterInverterData(linkedFilters)
    expect(filtered3.length).toBe(3)
  })

  it('should check active filters', () => {
    const hasActiveFilters = (filters) => {
      return filters.selectedDate || 
             filters.selectedFaultType || 
             filters.selectedLossType || 
             filters.selectedTimeSlot
    }

    expect(hasActiveFilters(linkedFilters)).toBe(false)

    linkedFilters.selectedDate = '2024-01-15'
    expect(hasActiveFilters(linkedFilters)).toBe(true)
  })

  it('should generate filter tags', () => {
    const getActiveFilterTags = (filters) => {
      const tags = []
      if (filters.selectedDate) tags.push({ type: 'date', label: `日期: ${filters.selectedDate}` })
      if (filters.selectedFaultType) tags.push({ type: 'fault', label: `故障: ${filters.selectedFaultType}` })
      if (filters.selectedLossType) tags.push({ type: 'loss', label: `损耗: ${filters.selectedLossType}` })
      if (filters.selectedTimeSlot) tags.push({ type: 'time', label: `时段: ${filters.selectedTimeSlot}` })
      return tags
    }

    linkedFilters.selectedDate = '2024-01-15'
    linkedFilters.selectedFaultType = '逆变器故障'
    
    const tags = getActiveFilterTags(linkedFilters)
    expect(tags.length).toBe(2)
    expect(tags[0].type).toBe('date')
    expect(tags[1].type).toBe('fault')
  })

  it('should remove specific filter', () => {
    linkedFilters.selectedDate = '2024-01-15'
    linkedFilters.selectedFaultType = '逆变器故障'
    linkedFilters.selectedLossType = '温度损耗'

    const removeFilter = (type) => {
      if (type === 'date') linkedFilters.selectedDate = null
      if (type === 'fault') linkedFilters.selectedFaultType = null
      if (type === 'loss') linkedFilters.selectedLossType = null
      if (type === 'time') linkedFilters.selectedTimeSlot = null
    }

    removeFilter('fault')
    expect(linkedFilters.selectedFaultType).toBeNull()
    expect(linkedFilters.selectedDate).not.toBeNull()
  })

  it('should clear all filters', () => {
    linkedFilters.selectedDate = '2024-01-15'
    linkedFilters.selectedFaultType = '逆变器故障'

    const clearAllFilters = () => {
      linkedFilters.selectedDate = null
      linkedFilters.selectedFaultType = null
      linkedFilters.selectedLossType = null
      linkedFilters.selectedTimeSlot = null
    }

    clearAllFilters()
    expect(linkedFilters.selectedDate).toBeNull()
    expect(linkedFilters.selectedFaultType).toBeNull()
  })

  it('should calculate power unit conversion', () => {
    const W_TO_KW = 0.001
    const KWH_TO_MWH = 0.001

    const watts = 1500
    const expectedKw = watts * W_TO_KW
    expect(expectedKw).toBe(1.5)

    const kwh = 1250
    const expectedMwh = kwh * KWH_TO_MWH
    expect(expectedMwh).toBe(1.25)
  })

  it('should validate data quality', () => {
    const validateData = (record) => {
      return record.powerOutput !== null &&
             record.powerOutput >= 0 &&
             record.dataQuality === 'good'
    }

    const validRecord = { powerOutput: 300, dataQuality: 'good' }
    const invalidRecords = [
      { powerOutput: -10, dataQuality: 'good' },
      { powerOutput: 300, dataQuality: 'suspect' },
      { powerOutput: null, dataQuality: 'good' }
    ]

    expect(validateData(validRecord)).toBe(true)
    invalidRecords.forEach(r => {
      expect(validateData(r)).toBe(false)
    })
  })
})

describe('Unit Conversion Tests', () => {
  it('should convert W to kW correctly', () => {
    const W_TO_KW = 0.001
    
    const testCases = [
      { w: 0, expected: 0 },
      { w: 1000, expected: 1 },
      { w: 1500, expected: 1.5 },
      { w: 250000, expected: 250 }
    ]

    testCases.forEach(({ w, expected }) => {
      expect(w * W_TO_KW).toBeCloseTo(expected, 4)
    })
  })

  it('should convert kWh to MWh correctly', () => {
    const KWH_TO_MWH = 0.001
    
    const testCases = [
      { kwh: 0, expected: 0 },
      { kwh: 1000, expected: 1 },
      { kwh: 1500, expected: 1.5 }
    ]

    testCases.forEach(({ kwh, expected }) => {
      expect(kwh * KWH_TO_MWH).toBeCloseTo(expected, 4)
    })
  })

  it('should calculate efficiency correctly', () => {
    const calculateEfficiency = (input, output) => {
      if (input <= 0.1) return null
      if (output < 0 || output > input * 1.1) return null
      return Math.round((output / input * 100 * 100) / 100)
    }

    expect(calculateEfficiency(1000, 950)).toBeCloseTo(95)
    expect(calculateEfficiency(1000, 1100)).toBeCloseTo(110)
    expect(calculateEfficiency(0, 500)).toBeNull()
    expect(calculateEfficiency(1000, 1200)).toBeNull()
  })
})

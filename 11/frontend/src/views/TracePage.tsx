import React from 'react'
import { Card, Row, Col } from 'antd'
import { TraceViewComponent } from '../components/lowcode/TraceViewComponent'
import { FilterComponent } from '../components/lowcode/FilterComponent'

const TracePage: React.FC = () => {
  return (
    <Row gutter={16}>
      <Col span={6}>
        <FilterComponent />
      </Col>
      <Col span={18}>
        <TraceViewComponent />
      </Col>
    </Row>
  )
}

export default TracePage
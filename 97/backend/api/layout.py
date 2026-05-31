from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json

from utils.cache import query_cache, generate_cache_key

router = APIRouter()


class LayoutConfig(BaseModel):
    layout_name: str
    user_id: str
    config: Dict[str, Any]
    is_default: bool = False


class LayoutUpdate(BaseModel):
    layout_name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None


class LayoutComponent(BaseModel):
    id: str
    type: str
    title: str
    x: int
    y: int
    w: int
    h: int
    minW: int = 1
    minH: int = 1
    maxW: Optional[int] = None
    maxH: Optional[int] = None
    props: Optional[Dict[str, Any]] = None


DEFAULT_LAYOUT = {
    "widgets": [
        {
            "id": "stats-1",
            "type": "StatsCard",
            "title": "统计概览",
            "x": 0,
            "y": 0,
            "w": 24,
            "h": 2,
            "minW": 12,
            "minH": 1
        },
        {
            "id": "trend-1",
            "type": "MetricTrendChart",
            "title": "指标趋势",
            "x": 0,
            "y": 2,
            "w": 16,
            "h": 6,
            "minW": 8,
            "minH": 4,
            "props": {"metricName": "temperature"}
        },
        {
            "id": "anomaly-1",
            "type": "AnomalyAlertList",
            "title": "异常告警",
            "x": 16,
            "y": 2,
            "w": 8,
            "h": 6,
            "minW": 4,
            "minH": 4
        },
        {
            "id": "device-status-1",
            "type": "DeviceStatusList",
            "title": "设备状态",
            "x": 0,
            "y": 8,
            "w": 14,
            "h": 7,
            "minW": 8,
            "minH": 4
        },
        {
            "id": "comparison-1",
            "type": "DeviceComparisonChart",
            "title": "设备对比",
            "x": 14,
            "y": 8,
            "w": 10,
            "h": 7,
            "minW": 6,
            "minH": 4
        },
        {
            "id": "realtime-1",
            "type": "RealtimeDataPanel",
            "title": "实时监控",
            "x": 0,
            "y": 15,
            "w": 24,
            "h": 4,
            "minW": 12,
            "minH": 2
        }
    ],
    "grid": {
        "cols": 24,
        "rowHeight": 50,
        "margin": [10, 10],
        "isDraggable": True,
        "isResizable": True,
        "isBounded": True
    },
    "theme": "dark"
}


@router.get("/default")
async def get_default_layout():
    try:
        return {
            "success": True,
            "layout_id": "default",
            "layout_name": "默认布局",
            "config": DEFAULT_LAYOUT
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取默认布局失败: {str(e)}")


@router.get("/list")
async def get_layout_list(user_id: str = Query(..., description="用户ID")):
    try:
        cache_key = generate_cache_key("layout_list", user_id=user_id)
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        layouts = [
            {
                "layout_id": "default",
                "layout_name": "默认布局",
                "user_id": user_id,
                "is_default": True,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            },
            {
                "layout_id": "overview-dashboard",
                "layout_name": "综合概览",
                "user_id": user_id,
                "is_default": False,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        ]
        
        result = {
            "success": True,
            "total": len(layouts),
            "layouts": layouts
        }
        
        query_cache.set(cache_key, result, ttl_seconds=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取布局列表失败: {str(e)}")


@router.get("/{layout_id}")
async def get_layout(
    layout_id: str,
    user_id: str = Query(..., description="用户ID")
):
    try:
        cache_key = generate_cache_key("layout_detail", layout_id=layout_id, user_id=user_id)
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        if layout_id == "default":
            result = {
                "success": True,
                "layout_id": "default",
                "layout_name": "默认布局",
                "user_id": user_id,
                "is_default": True,
                "config": DEFAULT_LAYOUT,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            query_cache.set(cache_key, result, ttl_seconds=120)
            return result
        
        raise HTTPException(status_code=404, detail="布局不存在")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取布局失败: {str(e)}")


@router.post("/")
async def create_layout(layout: LayoutConfig):
    try:
        layout_id = f"layout-{uuid.uuid4().hex[:8]}"
        
        result = {
            "success": True,
            "layout_id": layout_id,
            "layout_name": layout.layout_name,
            "user_id": layout.user_id,
            "is_default": layout.is_default,
            "config": layout.config,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        query_cache.delete(generate_cache_key("layout_list", user_id=layout.user_id))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建布局失败: {str(e)}")


@router.put("/{layout_id}")
async def update_layout(
    layout_id: str,
    layout_update: LayoutUpdate,
    user_id: str = Query(..., description="用户ID")
):
    try:
        if layout_id == "default":
            raise HTTPException(status_code=400, detail="默认布局不可修改")
        
        updated_layout = {
            "success": True,
            "layout_id": layout_id,
            "layout_name": layout_update.layout_name or "自定义布局",
            "user_id": user_id,
            "is_default": layout_update.is_default or False,
            "config": layout_update.config or {},
            "updated_at": datetime.now().isoformat()
        }
        
        query_cache.delete(generate_cache_key("layout_list", user_id=user_id))
        query_cache.delete(generate_cache_key("layout_detail", layout_id=layout_id, user_id=user_id))
        
        return updated_layout
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新布局失败: {str(e)}")


@router.delete("/{layout_id}")
async def delete_layout(
    layout_id: str,
    user_id: str = Query(..., description="用户ID")
):
    try:
        if layout_id == "default":
            raise HTTPException(status_code=400, detail="默认布局不可删除")
        
        query_cache.delete(generate_cache_key("layout_list", user_id=user_id))
        query_cache.delete(generate_cache_key("layout_detail", layout_id=layout_id, user_id=user_id))
        
        return {
            "success": True,
            "message": f"布局 {layout_id} 已删除"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除布局失败: {str(e)}")


@router.post("/{layout_id}/save-widgets")
async def save_layout_widgets(
    layout_id: str,
    widgets_config: Dict[str, Any],
    user_id: str = Query(..., description="用户ID")
):
    try:
        if layout_id == "default":
            raise HTTPException(status_code=400, detail="默认布局不可修改，请先另存为新布局")
        
        query_cache.delete(generate_cache_key("layout_detail", layout_id=layout_id, user_id=user_id))
        
        return {
            "success": True,
            "layout_id": layout_id,
            "message": "组件布局已保存",
            "widgets_count": len(widgets_config.get("widgets", []))
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存组件布局失败: {str(e)}")


@router.get("/templates/list")
async def get_layout_templates():
    try:
        templates = [
            {
                "template_id": "default",
                "name": "标准仪表盘",
                "description": "包含统计卡片、趋势图、设备列表等标准组件",
                "widget_count": 6,
                "preview": "grid"
            },
            {
                "template_id": "realtime-monitor",
                "name": "实时监控",
                "description": "侧重实时数据展示和告警通知",
                "widget_count": 5,
                "preview": "focus"
            },
            {
                "template_id": "analysis-view",
                "name": "深度分析",
                "description": "侧重多维度数据分析和下钻查询",
                "widget_count": 7,
                "preview": "analysis"
            },
            {
                "template_id": "overview",
                "name": "综合概览",
                "description": "全局数据总览，适合大屏展示",
                "widget_count": 8,
                "preview": "overview"
            }
        ]
        
        return {
            "success": True,
            "total": len(templates),
            "templates": templates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取模板列表失败: {str(e)}")


@router.get("/templates/{template_id}")
async def get_layout_template(template_id: str):
    try:
        if template_id == "default":
            config = DEFAULT_LAYOUT
        elif template_id == "realtime-monitor":
            config = {
                **DEFAULT_LAYOUT,
                "widgets": [
                    w for w in DEFAULT_LAYOUT["widgets"] 
                    if w["id"] in ["stats-1", "realtime-1", "anomaly-1"]
                ]
            }
        elif template_id == "analysis-view":
            config = {
                **DEFAULT_LAYOUT,
                "widgets": [
                    {**w, "h": 8 if "trend" in w["id"] else w["h"]}
                    for w in DEFAULT_LAYOUT["widgets"]
                ]
            }
        elif template_id == "overview":
            config = {
                **DEFAULT_LAYOUT,
                "grid": {**DEFAULT_LAYOUT["grid"], "cols": 32}
            }
        else:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        return {
            "success": True,
            "template_id": template_id,
            "config": config
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取模板失败: {str(e)}")

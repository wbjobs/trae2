import pytest
import sys
import os
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.gateway import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data


def test_analyze_text_endpoint(client):
    response = client.post(
        "/api/v1/analyze/text",
        json={
            "text": "原被告于2023年1月签订买卖合同，原告按约供货后被告拖欠货款50万元未付，请求判令被告支付货款及违约金。",
            "case_type": "民事",
            "top_k_provisions": 5,
            "top_k_cases": 3
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0


def test_search_provisions_endpoint(client):
    response = client.post(
        "/api/v1/search/provisions",
        json={
            "query": "合同违约责任",
            "top_k": 5
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "provisions" in data["data"]


def test_search_cases_endpoint(client):
    response = client.post(
        "/api/v1/search/cases",
        json={
            "query": "买卖合同货款纠纷",
            "case_type": "民事",
            "top_k": 3
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "cases" in data["data"]


def test_list_provisions_endpoint(client):
    response = client.get("/api/v1/provisions?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "provisions" in data["data"]


def test_list_cases_endpoint(client):
    response = client.get("/api/v1/cases?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 0
    assert "cases" in data["data"]

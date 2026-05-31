import pytest
from app.task_queue.celery_app import celery_app


def test_celery_config_has_time_limits():
    conf = celery_app.conf
    assert conf.task_soft_time_limit == 600
    assert conf.task_time_limit == 900


def test_celery_config_has_queue_routing():
    conf = celery_app.conf
    assert "app.task_queue.tasks.process_single_document_task" in conf.task_routes
    assert "app.task_queue.tasks.process_batch_coordinator_task" in conf.task_routes


def test_celery_config_prefetch_multiplier():
    conf = celery_app.conf
    assert conf.worker_prefetch_multiplier == 1


def test_celery_config_acks_late():
    conf = celery_app.conf
    assert conf.task_acks_late is True


def test_celery_config_has_queues():
    conf = celery_app.conf
    assert "coordinator" in conf.task_queues
    assert "processing" in conf.task_queues

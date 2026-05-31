"""
ViewSet Mixins
"""
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action


class SoftDeleteModelMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if hasattr(instance, 'is_deleted'):
            instance.is_deleted = True
            instance.save()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return super().destroy(request, *args, **kwargs)


class AuditLogMixin:
    def perform_create(self, serializer):
        instance = serializer.save()
        self._log_audit(instance, 'create')

    def perform_update(self, serializer):
        instance = serializer.save()
        self._log_audit(instance, 'update')

    def perform_destroy(self, instance):
        self._log_audit(instance, 'delete')
        super().perform_destroy(instance)

    def _log_audit(self, instance, action):
        from apps.audit.services import AuditLogService
        try:
            module = self.__class__.__module__.split('.')[-2]
            resource_type = instance.__class__.__name__
            AuditLogService.log(
                user=self.request.user,
                action=action,
                module=module,
                resource_type=resource_type,
                resource_id=str(instance.id),
                detail=f'{action} {resource_type}: {instance}'
            )
        except Exception:
            pass


class ToggleActiveMixin:
    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        instance = self.get_object()
        instance.is_active = not instance.is_active
        instance.save()
        return Response({
            'code': 200,
            'message': 'success',
            'data': {'is_active': instance.is_active}
        })


class ReadOnlyModelViewSet(mixins.RetrieveModelMixin,
                           mixins.ListModelMixin,
                           viewsets.GenericViewSet):
    pass

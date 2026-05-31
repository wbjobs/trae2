"""
自定义分页器
"""
from rest_framework.pagination import PageNumberPagination, LimitOffsetPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'code': 200,
            'message': 'success',
            'data': {
                'items': data,
                'total': self.page.paginator.count,
                'page': self.page.number,
                'page_size': self.page.paginator.per_page,
                'total_pages': self.page.paginator.num_pages,
            }
        })


class NoPagination(LimitOffsetPagination):
    def paginate_queryset(self, queryset, request, view=None):
        return None

    def get_paginated_response(self, data):
        return Response({
            'code': 200,
            'message': 'success',
            'data': data
        })

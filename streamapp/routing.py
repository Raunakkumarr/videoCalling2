from django.urls import re_path
from . import consumer

websocket_urlpatterns = [
    re_path('/ws/call/', consumer.CallConsumer.as_asgi()),
]

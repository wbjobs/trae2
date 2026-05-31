import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.gateway import start_server

if __name__ == "__main__":
    start_server()

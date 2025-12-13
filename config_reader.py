# Wrapper module for config-reader.py
# Dynamically load the hyphenated script and expose the functions as a normal module.
import importlib.util
import os

_spec_path = os.path.join(os.path.dirname(__file__), 'config-reader.py')
try:
    spec = importlib.util.spec_from_file_location('config_reader', _spec_path)
    _module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_module)

    # Export the expected function(s)
    get_config = getattr(_module, 'get_config')
    __all__ = ['get_config']
except Exception as e:
    print(f"Warning: Could not load config-reader.py: {e}")

    def get_config():
        return {}

    __all__ = ['get_config']

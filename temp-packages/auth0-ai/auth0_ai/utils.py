from typing import Dict, Iterable, TypeVar, Union, Any

K = TypeVar("K")
V = TypeVar("V")

def omit(obj: Union[Dict[K, V], Any], keys: Iterable[K]) -> Dict[K, V]:
    """Returns a new dict omitting the specified keys.
    
    Supports both dictionaries and objects with a __dict__ attribute.
    If the object does not have a __dict__, raises a TypeError.
    """
    keys_set = set(keys)

    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if k not in keys_set}

    if hasattr(obj, "__dict__"):
        return {k: v for k, v in vars(obj).items() if k not in keys_set}

    raise TypeError("omit() expects a dict or an object with a __dict__ attribute.")

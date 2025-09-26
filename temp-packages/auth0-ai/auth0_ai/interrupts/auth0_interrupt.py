from typing import Final, Type, TypeVar, Dict, Any

Auth0InterruptType = TypeVar("T", bound="Auth0Interrupt")

class Auth0Interrupt(Exception):
    _name: Final[str] = "AUTH0_AI_INTERRUPT"

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code

    @property
    def name(self) -> str:
        return self._name

    def to_json(self) -> Dict[str, Any]:
        """
        Serialize the interrupt to a JSON object.
        """
        return {
            key: value for key, value in self.__dict__.items()
        } | {"message": self.args[0], "name": self.name}

    @classmethod
    def is_interrupt(cls: Type[Auth0InterruptType], interrupt: Any) -> bool:
        """
        Checks if an interrupt is of a specific type asserting its data component.
        """
        if isinstance(interrupt, dict):
            return (
                interrupt.get("name") == "AUTH0_AI_INTERRUPT"
                and (not hasattr(cls, "code") or interrupt.get("code") == getattr(cls, "code", None))
            )
        
        return (
            isinstance(interrupt, Auth0Interrupt)
            and interrupt.name == "AUTH0_AI_INTERRUPT"
            and (not hasattr(cls, "code") or interrupt.code == getattr(cls, "code", None))
        )

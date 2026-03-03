class DjangoActorLoader:
    def __init__(self, user_model):
        self._user_model = user_model

    def __call__(self, actor_id: int):
        return self._user_model.objects.get(pk=actor_id)

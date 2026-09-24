from hypothesis import settings

settings.register_profile("ci", max_examples=40)
settings.register_profile("dev", max_examples=20)
settings.load_profile("ci")

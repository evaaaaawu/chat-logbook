# Register Plugins statically; no dynamic loading in v1

Plugins are registered statically in v1. Dynamic or third-party plugin loading is out of scope.

A Plugin reads Source and writes the Archive, so loading untrusted third-party code would be a real security exposure — it runs with full access to the user's conversation history and durable copy. The cost is no user-extensibility yet, accepted deliberately until there is a safe loading story.

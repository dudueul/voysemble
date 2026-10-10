# Source file headers

Every source file (TypeScript, Kotlin, Swift, SQL, shell, CSS, config with comment support) starts
with this header, adapted to the file's comment syntax:

```ts
// Copyright 2026- At Day. All rights reserved.
```

```kotlin
// Copyright 2026- At Day. All rights reserved.
```

```swift
// Copyright 2026- At Day. All rights reserved.
```

```sql
-- Copyright 2026- At Day. All rights reserved.
```

```sh
# Copyright 2026- At Day. All rights reserved.
```

Rules:

- Header is the first line (after a shebang if present).
- The year range stays `2026-` (open-ended). Do not bump per file.
- A lint check (`pnpm check:headers`) fails CI when a source file lacks it. JSON and lockfiles are
  exempt because they cannot carry comments.
- Generated files carry the header via the generator template.

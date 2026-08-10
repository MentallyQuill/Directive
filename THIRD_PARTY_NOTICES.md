# Third-Party Notices

Directive's provider routing and story-distillation behavior were developed with reference to working SillyTavern extensions. Directive owns its domain model, schemas, storage, host contracts, and runtime modules; these projects are not runtime dependencies.

## Behavioral reference pins

The V1 episode-evaluator behavior fixture pins the inspected extension versions so later changes do not silently reinterpret the borrowed behavior:

- Summaryception `5.5.3`, revision `c67626ab83ee86ec1be4f55b9b3d1d19adb79999`: replace prior summary understanding instead of appending duplicate memory; allow no-memory output.
- VectFox `3.6.8`, revision `886a0144ff8608aabcef4fe1b408a13260c1a730`: bounded semantic selection rather than mention-level capture.
- CharMemory `2.3.1`, revision `37b21025e120acfbe1dcdeaa8becb05efe7188b4`: retain only concise character-relevant moments.

The executable behavior cases live in `tests/fixtures/story/v1/episode-evaluator-borrowed-behavior.fixture.json`. Changing a pin or borrowed behavior requires a deliberate fixture and architecture review.

## Saga

Source project: Saga

Copyright (c) 2026 MentallyQuill

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## SillyTavern-MultihogDnDFramework

Copyright (c) 2026 MultihogAurelius

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

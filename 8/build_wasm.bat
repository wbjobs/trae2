@echo off
echo Building H.265 Parser WebAssembly module...
echo.

where emcc >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Emscripten not found in PATH.
    echo Please install Emscripten and add it to your PATH.
    echo Visit: https://emscripten.org/docs/getting_started/downloads.html
    exit /b 1
)

if not exist "public" mkdir public

emcc src/wasm/h265_parser.cpp ^
  -o public/h265_parser.js ^
  -s WASM=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=1 ^
  -s ENVIRONMENT=web ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s MAXIMUM_MEMORY=4GB ^
  -s EXPORTED_FUNCTIONS=["_malloc","_free","_parse_nalu","_find_nalu_in_chunk","_safe_parse_nalu","_safe_find_nalu_in_chunk"] ^
  -s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","getValue","setValue","HEAPU8","UTF8ToString"] ^
  -s "EXPORT_NAME=createH265ParserModule" ^
  -O3 ^
  -std=c++17 ^
  -s DISABLE_EXCEPTION_CATCHING=0

if %errorlevel% equ 0 (
    echo.
    echo Build successful!
    echo Output: public/h265_parser.js and public/h265_parser.wasm
) else (
    echo.
    echo Build failed!
    exit /b 1
)

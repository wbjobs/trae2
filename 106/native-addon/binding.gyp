{
  "targets": [
    {
      "target_name": "printer_backend",
      "sources": [
        "src/printer_backend.cc",
        "src/printer_manager.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "../cpp-backend/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_CPP_EXCEPTIONS", "BUILDING_PRINTER_BACKEND"],
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "../cpp-backend/src/platform/WindowsPlatform.cpp",
            "../cpp-backend/src/platform/PlatformFactory.cpp"
          ],
          "libraries": ["winspool.lib"]
        }],
        ["OS=='linux'", {
          "sources": [
            "../cpp-backend/src/platform/LinuxPlatform.cpp",
            "../cpp-backend/src/platform/PlatformFactory.cpp"
          ],
          "libraries": ["-lcups"]
        }]
      ],
      "sources!": [
        "../cpp-backend/src/platform/*.cpp"
      ]
    }
  ]
}

cmake_minimum_required(VERSION 3.16)

project(ICC-Client VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 COMPONENTS
    Core
    Gui
    Widgets
    Network
    WebSockets
    SerialPort
    Charts
    REQUIRED
)

set(PROJECT_SOURCES
    src/main.cpp
    src/MainWindow.cpp
    src/MainWindow.h

    src/models/DeviceModel.cpp
    src/models/DeviceModel.h
    src/models/StatusModel.cpp
    src/models/StatusModel.h
    src/models/CommandModel.cpp
    src/models/CommandModel.h
    src/models/TemplateModel.cpp
    src/models/TemplateModel.h
    src/models/ScheduledModel.cpp
    src/models/ScheduledModel.h

    src/services/ApiClient.cpp
    src/services/ApiClient.h
    src/services/WebSocketClient.cpp
    src/services/WebSocketClient.h

    src/panels/DashboardPanel.cpp
    src/panels/DashboardPanel.h
    src/panels/DevicePanel.cpp
    src/panels/DevicePanel.h
    src/panels/CommandPanel.cpp
    src/panels/CommandPanel.h
    src/panels/StatusPanel.cpp
    src/panels/StatusPanel.h
    src/panels/TemplatePanel.cpp
    src/panels/TemplatePanel.h
    src/panels/SchedulePanel.cpp
    src/panels/SchedulePanel.h
    src/panels/AlertDialog.cpp
    src/panels/AlertDialog.h

    src/platform/PlatformAdapter.cpp
    src/platform/PlatformAdapter.h

    src/resources/resources.qrc
)

add_executable(ICC-Client
    ${PROJECT_SOURCES}
)

target_link_libraries(ICC-Client PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
    Qt6::WebSockets
    Qt6::SerialPort
    Qt6::Charts
)

set_target_properties(ICC-Client PROPERTIES
    WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE TRUE
)

if(WIN32)
    target_compile_definitions(ICC-Client PRIVATE ICC_PLATFORM_WINDOWS)
elseif(UNIX)
    target_compile_definitions(ICC-Client PRIVATE ICC_PLATFORM_LINUX)
endif()

install(TARGETS ICC-Client
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

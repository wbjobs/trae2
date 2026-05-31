using System;
using IndustrialSimulation.Server.Core;
using IndustrialSimulation.Server.Network;
using IndustrialSimulation.Server.Simulation;

namespace IndustrialSimulation.Server
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("========================================");
            Console.WriteLine("  工业设备故障推演系统 - Socket 服务端");
            Console.WriteLine("========================================");
            Console.WriteLine();

            var port = ServerConfig.DefaultPort;
            if (args.Length > 0 && int.TryParse(args[0], out var customPort))
            {
                port = customPort;
            }

            ServerDatabase.Initialize();

            var serverState = new ServerState();
            var networkServer = new NetworkServer(port, serverState);

            networkServer.OnClientConnected += (sessionId, client) =>
            {
                Console.WriteLine($"[连接] 新客户端连接: {sessionId}");
            };

            networkServer.OnClientDisconnected += (sessionId, client) =>
            {
                Console.WriteLine($"[断开] 客户端断开: {client.PlayerName ?? sessionId}");
                ServerDatabase.Instance?.UpdateDisconnectLog(client.PlayerId);
            };

            networkServer.Start();

            Console.WriteLine($"服务已启动，监听端口: {port}");
            Console.WriteLine("输入 'help' 查看可用命令");
            Console.WriteLine();

            while (true)
            {
                Console.Write("> ");
                var input = Console.ReadLine()?.Trim().ToLower();

                if (string.IsNullOrEmpty(input)) continue;

                switch (input)
                {
                    case "help":
                        ShowHelp();
                        break;
                    case "status":
                        ShowStatus(serverState, networkServer);
                        break;
                    case "clients":
                        ShowClients(serverState);
                        break;
                    case "sessions":
                        ShowSessions(serverState);
                        break;
                    case "workshops":
                        ShowWorkshops(serverState);
                        break;
                    case "equipment":
                        ShowEquipment(serverState);
                        break;
                    case "history":
                        ShowSessionHistory();
                        break;
                    case "clear":
                        Console.Clear();
                        break;
                    case "exit":
                    case "quit":
                        Console.WriteLine("正在关闭服务...");
                        networkServer.Stop();
                        ServerDatabase.Shutdown();
                        return;
                    default:
                        Console.WriteLine($"未知命令: {input}，输入 'help' 查看可用命令");
                        break;
                }
            }
        }

        static void ShowHelp()
        {
            Console.WriteLine();
            Console.WriteLine("可用命令:");
            Console.WriteLine("  help       - 显示帮助信息");
            Console.WriteLine("  status     - 显示服务器状态");
            Console.WriteLine("  clients    - 显示已连接客户端");
            Console.WriteLine("  sessions   - 显示活动推演会话");
            Console.WriteLine("  workshops  - 显示车间列表");
            Console.WriteLine("  equipment  - 显示设备列表");
            Console.WriteLine("  history    - 显示推演历史记录");
            Console.WriteLine("  clear      - 清空控制台");
            Console.WriteLine("  exit/quit  - 退出服务器");
            Console.WriteLine();
        }

        static void ShowStatus(ServerState state, NetworkServer server)
        {
            Console.WriteLine();
            Console.WriteLine("服务器状态:");
            Console.WriteLine($"  运行状态: {(server.IsRunning ? "运行中" : "已停止")}");
            Console.WriteLine($"  监听端口: {server.Port}");
            Console.WriteLine($"  连接客户端: {state.ConnectedClients.Count}");
            Console.WriteLine($"  活动推演: {state.ActiveSessions.Count}");
            Console.WriteLine($"  车间数量: {state.Workshops.Count}");
            Console.WriteLine($"  设备数量: {state.Equipment.Count}");
            Console.WriteLine($"  数据库: {(ServerDatabase.Instance != null ? "已连接" : "未连接")}");
            Console.WriteLine();
        }

        static void ShowClients(ServerState state)
        {
            Console.WriteLine();
            Console.WriteLine($"已连接客户端 ({state.ConnectedClients.Count}):");
            foreach (var client in state.ConnectedClients.Values)
            {
                Console.WriteLine($"  - {client.PlayerName ?? "未命名"} ({client.PlayerId})");
                Console.WriteLine($"    会话ID: {client.SessionId}");
                Console.WriteLine($"    当前推演: {client.CurrentSimulationId ?? "无"}");
                Console.WriteLine($"    连接时间: {client.ConnectedTime:yyyy-MM-dd HH:mm:ss}");
                Console.WriteLine();
            }
        }

        static void ShowSessions(ServerState state)
        {
            Console.WriteLine();
            Console.WriteLine($"活动推演会话 ({state.ActiveSessions.Count}):");
            foreach (var session in state.ActiveSessions.Values)
            {
                Console.WriteLine($"  - {session.Name} ({session.Id})");
                Console.WriteLine($"    主持人: {session.HostId}");
                Console.WriteLine($"    参与者: {session.ParticipantIds.Count} 人");
                Console.WriteLine($"    车间: {session.WorkshopId}");
                Console.WriteLine($"    开始时间: {session.StartTime:yyyy-MM-dd HH:mm:ss}");
                Console.WriteLine($"    模拟速度: {session.SimulationSpeed}x");
                Console.WriteLine($"    活动故障: {session.ActiveFaults.Count}");
                Console.WriteLine($"    待注入故障: {session.PendingFaultCodes.Count}");
                Console.WriteLine();
            }
        }

        static void ShowWorkshops(ServerState state)
        {
            Console.WriteLine();
            Console.WriteLine($"车间列表 ({state.Workshops.Count}):");
            foreach (var workshop in state.Workshops)
            {
                var eqCount = 0;
                foreach (var eq in state.Equipment.Values)
                {
                    if (eq.WorkshopId == workshop.Id) eqCount++;
                }

                Console.WriteLine($"  - {workshop.Name} ({workshop.Id})");
                Console.WriteLine($"    描述: {workshop.Description}");
                Console.WriteLine($"    设备数: {eqCount}");
                Console.WriteLine();
            }
        }

        static void ShowEquipment(ServerState state)
        {
            Console.WriteLine();
            Console.WriteLine($"设备列表 ({state.Equipment.Count}):");
            foreach (var eq in state.Equipment.Values)
            {
                Console.WriteLine($"  - {eq.Name} ({eq.Id})");
                Console.WriteLine($"    类型: {eq.Type}");
                Console.WriteLine($"    状态: {eq.Status}");
                Console.WriteLine($"    车间: {eq.WorkshopId}");
                Console.WriteLine($"    位置: ({eq.PositionX}, {eq.PositionY}, {eq.PositionZ})");
                Console.WriteLine($"    参数: {eq.Parameters.Count} 个");
                Console.WriteLine();
            }
        }

        static void ShowSessionHistory()
        {
            var db = ServerDatabase.Instance;
            if (db == null)
            {
                Console.WriteLine("数据库未初始化");
                return;
            }

            var history = db.GetSessionHistory(10);
            Console.WriteLine();
            Console.WriteLine($"推演历史记录 ({history.Count}):");
            foreach (var record in history)
            {
                Console.WriteLine($"  - {record["name"]} ({record["id"]})");
                Console.WriteLine($"    车间: {record["workshop_id"]}");
                Console.WriteLine($"    主持人: {record["host_id"]}");
                var startTime = TimestampHelper.TimestampToDateTime(Convert.ToInt64(record["start_time"]));
                Console.WriteLine($"    开始: {startTime:yyyy-MM-dd HH:mm:ss}");
                var isActive = Convert.ToInt32(record["is_active"]) == 1;
                Console.WriteLine($"    状态: {(isActive ? "进行中" : "已结束")}");
                Console.WriteLine();
            }
        }
    }
}

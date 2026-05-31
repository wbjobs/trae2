import argparse
import sys
from typing import List, Optional, Dict, Callable, Any
from functools import partial

from . import __version__
from .config import ServerConfig, config_manager
from .executor import CommandExecutor, ExecutionResult
from .logger import output_formatter


EXECUTOR_COMMANDS: Dict[str, Dict[str, Any]] = {
    "exec": {
        "help": "Execute command on remote servers",
        "description": "Execute a shell command on one or more remote servers",
        "args": [
            {"name": "cmd", "help": "Command to execute (use quotes for commands with spaces)"},
            {"flag": "-V", "name": "--verbose", "action": "store_true", "help": "Show full output for all servers"},
        ],
        "needs_command_validation": True,
    },
    "health": {
        "help": "Run health check on servers",
        "description": "Check system health (CPU, memory, disk, load)",
        "args": [],
        "needs_command_validation": False,
    },
    "service": {
        "help": "Manage system services",
        "description": "Start, stop, restart, or check status of services",
        "args": [
            {"name": "service", "help": "Service name"},
            {
                "name": "action",
                "choices": ["status", "start", "stop", "restart", "reload", "enable", "disable"],
                "help": "Action to perform"
            },
        ],
        "needs_command_validation": False,
    },
    "deploy": {
        "help": "Deploy configuration files",
        "description": "Upload and deploy configuration files to servers",
        "args": [
            {"name": "local_path", "help": "Local file path"},
            {"name": "remote_path", "help": "Remote file path"},
            {"flag": "--no-backup", "action": "store_true", "help": "Do not backup existing remote file"},
        ],
        "needs_command_validation": False,
    },
    "script": {
        "help": "Run script on remote servers",
        "description": "Upload and execute a script on remote servers",
        "args": [
            {"name": "script", "help": "Local script path"},
            {"flag": "--args", "default": "", "help": "Arguments to pass to the script"},
        ],
        "needs_command_validation": False,
    },
    "disk": {
        "help": "Check disk usage",
        "description": "Check disk space usage on servers",
        "args": [
            {"flag": "--path", "default": "/", "help": "Mount point to check (default: /)"},
        ],
        "needs_command_validation": False,
    },
}


class CLI:
    def __init__(self):
        self.parser = self._create_parser()
        self.subparsers = self.parser.add_subparsers(
            dest="command",
            title="Available Commands",
            metavar="COMMAND"
        )
        self._command_handlers: Dict[str, Callable] = {}
        self._register_executor_commands()
        self._register_server_commands()

    def _create_parser(self) -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(
            prog="cluster-ops",
            description="Server Cluster Operations Management Tool",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog=self._get_examples(),
        )
        parser.add_argument(
            "-v", "--version",
            action="version",
            version=f"%(prog)s {__version__}"
        )
        return parser

    def _get_examples(self) -> str:
        return """
Examples:
  cluster-ops exec "uptime" --all
  cluster-ops exec "df -h" --servers web1 web2
  cluster-ops exec "tail /var/log/nginx/access.log" --tags web
  cluster-ops health --all
  cluster-ops service nginx status --tags web
  cluster-ops service nginx restart --all
  cluster-ops deploy ./nginx.conf /etc/nginx/nginx.conf --tags web
  cluster-ops script ./deploy.sh --all
  cluster-ops disk --all
  cluster-ops server list
  cluster-ops server add --name web1 --host 192.168.1.10 --user root --tags web
            """

    def _add_server_filter_args(self, parser: argparse.ArgumentParser) -> None:
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--all", action="store_true", help="Run on all configured servers")
        group.add_argument("--servers", nargs="+", metavar="SERVER", help="Run on specific servers by name")
        group.add_argument("--tags", nargs="+", metavar="TAG", help="Run on servers with specific tags")

    def _add_parallel_arg(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "-p", "--parallel",
            type=int,
            default=config_manager.config.default_parallel,
            help=f"Number of parallel connections (default: {config_manager.config.default_parallel})"
        )

    def _add_command_args(self, parser: argparse.ArgumentParser, args_config: list) -> None:
        for arg in args_config:
            if "flag" in arg:
                flag_args = [arg["flag"]]
                if "name" in arg:
                    flag_args.append(arg["name"])
                kwargs = {k: v for k, v in arg.items() if k not in ("flag", "name")}
                parser.add_argument(*flag_args, **kwargs)
            else:
                parser.add_argument(arg["name"], **{k: v for k, v in arg.items() if k != "name"})

    def _register_executor_commands(self) -> None:
        for cmd_name, cmd_config in EXECUTOR_COMMANDS.items():
            parser = self.subparsers.add_parser(
                cmd_name,
                help=cmd_config["help"],
                description=cmd_config["description"]
            )
            self._add_command_args(parser, cmd_config["args"])
            self._add_server_filter_args(parser)
            self._add_parallel_arg(parser)
            self._command_handlers[cmd_name] = partial(
                self._handle_executor_command,
                cmd_name=cmd_name,
                needs_validation=cmd_config.get("needs_command_validation", False)
            )

    def _register_server_commands(self) -> None:
        server_parser = self.subparsers.add_parser(
            "server",
            help="Manage server configurations",
            description="Add, remove, or list configured servers"
        )
        server_subparsers = server_parser.add_subparsers(dest="server_command", metavar="SUBCOMMAND")

        list_parser = server_subparsers.add_parser("list", help="List all configured servers")

        add_parser = server_subparsers.add_parser("add", help="Add a new server")
        add_parser.add_argument("--name", required=True, help="Server name")
        add_parser.add_argument("--host", required=True, help="Server hostname/IP")
        add_parser.add_argument("--port", type=int, default=22, help="SSH port (default: 22)")
        add_parser.add_argument("--user", default="root", help="SSH username (default: root)")
        add_parser.add_argument("--password", help="SSH password")
        add_parser.add_argument("--key", help="Path to private key file")
        add_parser.add_argument("--passphrase", help="Private key passphrase")
        add_parser.add_argument("--tags", nargs="+", default=[], help="Server tags")

        remove_parser = server_subparsers.add_parser("remove", help="Remove a server")
        remove_parser.add_argument("name", help="Server name to remove")

        self._command_handlers["server"] = self._handle_server

    def _get_servers_from_args(self, args: argparse.Namespace) -> Optional[List[str]]:
        if args.all:
            return None
        elif args.servers:
            return args.servers
        return None

    def _get_tags_from_args(self, args: argparse.Namespace) -> Optional[List[str]]:
        if hasattr(args, 'tags') and args.tags and not args.all and not args.servers:
            return args.tags
        return None

    def _validate_and_prepare(self, args: argparse.Namespace, cmd_name: str, needs_validation: bool) -> Optional[tuple]:
        server_names = self._get_servers_from_args(args)
        tags = self._get_tags_from_args(args)

        if needs_validation and cmd_name == "exec":
            is_valid, error_msg = config_manager.validate_command(args.cmd)
            if not is_valid:
                print(f"\n\033[91mSecurity Error: {error_msg}\033[0m", file=sys.stderr)
                print(f"Command blocked: {args.cmd}\n", file=sys.stderr)
                return None

        return server_names, tags

    def _handle_executor_command(self, args: argparse.Namespace, cmd_name: str, needs_validation: bool) -> int:
        prepared = self._validate_and_prepare(args, cmd_name, needs_validation)
        if prepared is None:
            return 1
        server_names, tags = prepared

        executor = CommandExecutor()

        dispatch_table = {
            "exec": lambda: executor.execute_command(
                args.cmd, server_names=server_names, tags=tags,
                parallel=args.parallel, verbose=args.verbose
            ),
            "health": lambda: executor.health_check(
                server_names=server_names, tags=tags, parallel=args.parallel
            ),
            "service": lambda: (
                executor.service_status(
                    args.service, server_names=server_names, tags=tags, parallel=args.parallel
                ) if args.action == "status" else
                executor.service_manage(
                    args.service, args.action, server_names=server_names,
                    tags=tags, parallel=args.parallel
                )
            ),
            "deploy": lambda: executor.deploy_config(
                args.local_path, args.remote_path, server_names=server_names,
                tags=tags, parallel=args.parallel, backup=not args.no_backup
            ),
            "script": lambda: executor.run_script(
                args.script, server_names=server_names, tags=tags,
                parallel=args.parallel, args=args.args
            ),
            "disk": lambda: executor.disk_usage(
                args.path, server_names=server_names, tags=tags, parallel=args.parallel
            ),
        }

        handler = dispatch_table.get(cmd_name)
        if not handler:
            return 1

        result = handler()
        return 0 if result.success else 1

    def _handle_server(self, args: argparse.Namespace) -> int:
        if not args.server_command:
            print("Usage: cluster-ops server {list,add,remove}", file=sys.stderr)
            return 1

        handlers = {
            "list": self._handle_server_list,
            "add": self._handle_server_add,
            "remove": self._handle_server_remove,
        }

        handler = handlers.get(args.server_command)
        if not handler:
            return 1
        return handler(args)

    def _handle_server_list(self, args: argparse.Namespace) -> int:
        servers = config_manager.get_all_servers()
        if not servers:
            print("No servers configured.")
            return 0

        output_formatter.print_table(
            ["Name", "Host", "Port", "User", "Tags"],
            [
                [s.name, s.host, str(s.port), s.username, ", ".join(s.tags) or "-"]
                for s in sorted(servers, key=lambda x: x.name)
            ]
        )
        return 0

    def _handle_server_add(self, args: argparse.Namespace) -> int:
        server = ServerConfig(
            name=args.name,
            host=args.host,
            port=args.port,
            username=args.user,
            password=args.password,
            private_key=args.key,
            private_key_passphrase=args.passphrase,
            tags=args.tags
        )
        config_manager.add_server(server)
        print(f"Server '{args.name}' added successfully.")
        return 0

    def _handle_server_remove(self, args: argparse.Namespace) -> int:
        if config_manager.remove_server(args.name):
            print(f"Server '{args.name}' removed successfully.")
            return 0
        print(f"Server '{args.name}' not found.", file=sys.stderr)
        return 1

    def run(self, argv: Optional[List[str]] = None) -> int:
        args = self.parser.parse_args(argv)

        if not args.command:
            self.parser.print_help()
            return 1

        try:
            handler = self._command_handlers.get(args.command)
            if handler:
                return handler(args)
            self.parser.print_help()
            return 1
        except KeyboardInterrupt:
            print("\nOperation cancelled by user")
            return 130
        except Exception as e:
            print(f"\nError: {e}", file=sys.stderr)
            return 1


def main() -> int:
    return CLI().run()


if __name__ == "__main__":
    sys.exit(main())

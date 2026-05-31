import { useEffect, useState } from 'react';
import SceneCanvas from '@/components/three/SceneCanvas';
import Toolbar from '@/components/ui/Toolbar';
import Sidebar from '@/components/ui/Sidebar';
import PropertyPanel from '@/components/ui/PropertyPanel';
import CollisionPanel from '@/components/ui/CollisionPanel';
import ClipControl from '@/components/ui/ClipControl';
import StylePanel from '@/components/ui/StylePanel';
import StatusBar from '@/components/ui/StatusBar';
import { apiClient } from '@/lib/api';
import { useScene } from '@/store/scene';
import { Box, Cpu } from 'lucide-react';

export default function Home() {
  const setPipelines = useScene((s) => s.setPipelines);
  const setSections = useScene((s) => s.setSections);
  const setAnnotations = useScene((s) => s.setAnnotations);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sections, pipelines, annotations] = await Promise.all([
          apiClient.listSections(),
          apiClient.listPipelines(),
          apiClient.listAnnotations().catch(() => []),
        ]);
        if (!mounted) return;
        setSections(sections);
        setPipelines(pipelines);
        if (Array.isArray(annotations)) setAnnotations(annotations);
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setPipelines, setSections, setAnnotations]);

  return (
    <div className="h-screen w-screen flex flex-col bg-base-950 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-accent-cyan/15 bg-base-900/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-accent-cyan/10 border border-accent-cyan/40 flex items-center justify-center">
            <Box className="w-4 h-4 text-accent-cyan" />
          </div>
          <div>
            <h1 className="font-display text-lg tracking-wider text-accent-cyan leading-tight">
              地下管廊三维碰撞检测平台
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono">
              Utility Tunnel 3D Collision Detection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Cpu className="w-3.5 h-3.5 text-accent-success" />
          <span>设计数据库已连接</span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-accent-cyan/10 p-2 flex flex-col gap-2">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Sidebar />
          </div>
          <StylePanel />
        </aside>

        <main className="flex-1 relative flex flex-col min-w-0">
          <div className="p-2">
            <Toolbar />
          </div>

          <div className="flex-1 relative p-2 pt-0 min-h-0">
            <div className="w-full h-full rounded-md overflow-hidden border border-accent-cyan/15 relative">
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-base-950 z-10">
                  <div className="text-accent-cyan text-sm animate-pulseSoft">
                    正在加载三维场景...
                  </div>
                </div>
              )}
              <SceneCanvas />
            </div>
          </div>

          <div className="px-2 pb-2">
            <StatusBar />
          </div>

          <div className="absolute top-16 right-4 z-10">
            <ClipControl />
          </div>
        </main>

        <aside className="w-72 border-l border-accent-cyan/10 p-2 flex flex-col gap-2">
          <div className="flex-1 min-h-0">
            <PropertyPanel />
          </div>
          <div className="flex-1 min-h-0">
            <CollisionPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

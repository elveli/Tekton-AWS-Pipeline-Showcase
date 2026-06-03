import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { pipelineStages, PipelineStage } from './data';
import {
  Key, GitBranch, Package, Server, FastForward,
  ChevronRight, Play, CheckCircle2, FileText, Info
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Key, GitBranch, Package, Server, FastForward, FileText
};

export default function App() {
  const [activeStageId, setActiveStageId] = useState<string>(pipelineStages[0].id);
  const activeStage = pipelineStages.find((s) => s.id === activeStageId) || pipelineStages[0];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
            <div>
              <h1 className="font-semibold tracking-tight text-white">Tekton on AWS</h1>
              <p className="text-xs text-neutral-400 font-mono">EKS + ECR Deployment Pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full ring-1 ring-emerald-400/20">
            <CheckCircle2 className="w-4 h-4" />
            <span>Success</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Visual Pipeline Flow */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0">
          <div>
            <h2 className="text-lg font-medium text-white mb-1">Pipeline Stages</h2>
            <p className="text-sm text-neutral-400">Select a stage to view its configuration.</p>
          </div>

          <div className="relative">
            {/* The structural connection line behind items */}
            <div className="absolute left-[1.35rem] top-8 bottom-8 w-px bg-neutral-800" />
            
            <div className="flex flex-col gap-2 relative z-0">
              {pipelineStages.map((stage, idx) => {
                const Icon = iconMap[stage.icon] || Info;
                const isActive = stage.id === activeStageId;
                const isConfig = stage.id === 'docs' || stage.id === 'setup' || stage.id === 'pipeline'; // visual differentiation

                return (
                  <button
                    key={stage.id}
                    onClick={() => setActiveStageId(stage.id)}
                    className={`w-full text-left flex items-start gap-4 p-4 rounded-xl transition-all duration-200 outline-none ${
                        isActive 
                        ? 'bg-neutral-800/80 ring-1 ring-blue-500 shadow-lg shadow-blue-500/10' 
                        : 'hover:bg-neutral-800/40 hover:ring-1 hover:ring-neutral-700'
                    }`}
                  >
                    <div className={`shrink-0 p-2 rounded-lg flex items-center justify-center mt-0.5 ${
                        isActive 
                        ? 'bg-blue-600 text-white' 
                        : isConfig 
                          ? 'bg-purple-500/10 text-purple-400' 
                          : 'bg-neutral-800 text-neutral-300'
                    }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`font-medium ${isActive ? 'text-white' : 'text-neutral-200'}`}>
                        {stage.title}
                      </h3>
                      <p className="text-sm text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                        {stage.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Content Detail Pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStage.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col pt-2"
            >
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-neutral-800 rounded text-neutral-300">
                    {React.createElement(iconMap[activeStage.icon] || Info, { className: "w-5 h-5" })}
                  </div>
                  <h2 className="text-2xl font-semibold text-white tracking-tight">{activeStage.title}</h2>
                </div>
                <div className="text-neutral-300 leading-relaxed text-[15px]">
                  <p>{activeStage.overview}</p>
                </div>
              </div>

              {activeStage.files.length > 0 && (
                <div className="flex flex-col gap-6 mt-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Configurations
                  </h3>
                  
                  {activeStage.files.map((file, idx) => (
                    <div key={idx} className="flex flex-col rounded-xl overflow-hidden bg-[#111111] ring-1 ring-neutral-800 shadow-xl">
                      <div className="bg-neutral-900/80 px-4 py-2 border-b border-neutral-800 flex items-center justify-between backdrop-blur-md">
                        <span className="text-sm font-mono text-neutral-400">{file.filename}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
                          {file.language}
                        </span>
                      </div>
                      <div className="p-4 overflow-x-auto text-[13px] leading-snug">
                        <pre className="font-mono text-neutral-300">
                          <code>{file.content}</code>
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

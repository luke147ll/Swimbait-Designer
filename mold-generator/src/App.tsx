import { LoadingScreen } from './ui/LoadingScreen';
import { TopBar } from './ui/TopBar';
import { BottomBar } from './ui/BottomBar';
import { BaitLoader } from './ui/panels/BaitLoader';
import { MoldViewport } from './ui/viewport/MoldViewport';
import { PrinterSelector } from './ui/panels/PrinterSelector';
import { MoldConfigPanel } from './ui/panels/MoldConfigPanel';
import { AlignmentPanel } from './ui/panels/AlignmentPanel';
import { SpruePanel } from './ui/panels/SpruePanel';
import { ClampPanel } from './ui/panels/ClampPanel';
import { SlotPanel } from './ui/panels/SlotPanel';
import { ExportPanel } from './ui/panels/ExportPanel';
import { AccordionPanel } from './ui/shared/AccordionPanel';
import { useMoldEngine } from './hooks/useMoldEngine';
import { useBedValidation } from './hooks/useBedValidation';

function App() {
  useMoldEngine();
  useBedValidation();

  return (
    <>
      <LoadingScreen />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh',
        background: '#141414', color: '#d4d4d4', fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>

        <TopBar />

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{
            width: 340, minWidth: 340, background: '#1a1a1e',
            borderRight: '1px solid #333338', overflowY: 'auto', flexShrink: 0,
          }}>
            <BaitLoader />

            <AccordionPanel title="Surface Textures & Detail" locked defaultExpanded={false}>
              <div style={{ opacity: 0.5, padding: '4px 0' }}>
                <div style={{ fontSize: 13, color: '#5d6385', marginBottom: 4 }}>
                  Scales, gill plates, fin rays, and anatomical detail
                </div>
                <div style={{ fontSize: 12, color: '#f97316' }}>Coming Soon</div>
              </div>
            </AccordionPanel>

            <PrinterSelector />
            <MoldConfigPanel />
            <AlignmentPanel />
            <SpruePanel />
            <ClampPanel />
            <SlotPanel />
            <ExportPanel />
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <MoldViewport />
          </div>
        </div>

        <BottomBar />
      </div>
    </>
  );
}

export default App;

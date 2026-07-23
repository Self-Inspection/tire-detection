import { useReducer } from 'react';
import HomeScreen from './components/screens/HomeScreen.jsx';
import SetupScreen from './components/screens/SetupScreen.jsx';
import ScannerScreen from './components/screens/ScannerScreen.jsx';
import ResultsScreen from './components/screens/ResultsScreen.jsx';
import HistoryScreen from './components/screens/HistoryScreen.jsx';

const initialState = {
  screen: 'home',
  tireType: null,
  scanConfig: null,
  scanResult: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'CAMERA_GRANTED':
      return { ...state, screen: 'setup' };
    case 'BEGIN_SCAN':
      return { ...state, screen: 'scanning', tireType: action.tireType, scanConfig: action.scanConfig };
    case 'SCAN_COMPLETE':
      return { ...state, screen: 'results', scanResult: action.result };
    case 'SCAN_AGAIN':
      return { ...state, screen: 'setup', scanResult: null };
    case 'VIEW_HISTORY':
      return { ...state, screen: 'history' };
    case 'DONE':
      return { ...initialState };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <div className="fixed inset-0 bg-dark-bg text-white overflow-hidden">
      {state.screen === 'home' && (
        <HomeScreen
          onCameraGranted={() => dispatch({ type: 'CAMERA_GRANTED' })}
          onViewHistory={() => dispatch({ type: 'VIEW_HISTORY' })}
        />
      )}
      {state.screen === 'history' && (
        <HistoryScreen onBack={() => dispatch({ type: 'DONE' })} />
      )}
      {state.screen === 'setup' && (
        <SetupScreen onBeginScan={(tireType, scanConfig) => dispatch({ type: 'BEGIN_SCAN', tireType, scanConfig })} />
      )}
      {state.screen === 'scanning' && (
        <ScannerScreen
          tireType={state.tireType}
          scanConfig={state.scanConfig}
          onComplete={(result) => dispatch({ type: 'SCAN_COMPLETE', result })}
          onCancel={() => dispatch({ type: 'SCAN_AGAIN' })}
        />
      )}
      {state.screen === 'results' && (
        <ResultsScreen
          result={state.scanResult}
          onScanAgain={() => dispatch({ type: 'SCAN_AGAIN' })}
          onDone={() => dispatch({ type: 'DONE' })}
        />
      )}
    </div>
  );
}

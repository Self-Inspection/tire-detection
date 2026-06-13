export default function Button({ children, variant = 'primary', onClick, loading, fullWidth, className = '', disabled }) {
  const base = 'flex items-center justify-center gap-2 font-semibold rounded-xl py-4 px-6 text-base transition-opacity active:opacity-70';
  const styles = {
    primary:   'bg-blue-600 text-white',
    secondary: 'bg-dark-card text-white',
    danger:    'bg-red-600 text-white'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ touchAction: 'manipulation' }}
      className={`${base} ${styles[variant]} ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'opacity-50' : ''} ${className}`}
    >
      {loading
        ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        : children}
    </button>
  );
}

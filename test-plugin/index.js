// Test Plugin for GuteMusik
(function() {
  var React = window.GuteMusik.React;
  var useState = React.useState;
  var usePluginAPI = window.GuteMusik.usePluginAPI;

  var TestPluginView = function() {
    var api = usePluginAPI();
    var _state = useState(0);
    var count = _state[0];
    var setCount = _state[1];

    var _saved = useState(function() { return api.storage.get('savedCount') || 0; });
    var savedCount = _saved[0];
    var setSavedCount = _saved[1];

    return React.createElement('div', { className: 'p-8 animate-fade-in' },
      React.createElement('h1', {
        className: 'text-5xl font-medium text-white tracking-tighter mb-2'
      }, 'Test Plugin'),
      React.createElement('p', {
        className: 'text-white/30 text-lg mb-12'
      }, 'Verifying plugin system works correctly.'),

      // Status section
      React.createElement('div', { className: 'space-y-6' },
        // API check
        React.createElement('div', {
          className: 'bg-white/[0.03] border border-white/5 rounded-2xl p-6'
        },
          React.createElement('h3', {
            className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase mb-4'
          }, 'API Status'),
          React.createElement('div', { className: 'space-y-2 text-sm' },
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-white/40' }, 'usePluginAPI()'),
              React.createElement('span', { className: 'text-emerald-400' }, 'Connected')
            ),
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-white/40' }, 'Plugin ID'),
              React.createElement('span', { className: 'text-white/60 font-mono' }, api.pluginId)
            ),
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-white/40' }, 'Audio available'),
              React.createElement('span', { className: api.audio.state ? 'text-emerald-400' : 'text-red-400' },
                api.audio.state ? 'Yes' : 'No')
            ),
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-white/40' }, 'Library available'),
              React.createElement('span', { className: api.library ? 'text-emerald-400' : 'text-red-400' },
                api.library ? 'Yes' : 'No')
            ),
            React.createElement('div', { className: 'flex justify-between' },
              React.createElement('span', { className: 'text-white/40' }, 'Storage available'),
              React.createElement('span', { className: api.storage ? 'text-emerald-400' : 'text-red-400' },
                api.storage ? 'Yes' : 'No')
            )
          )
        ),

        // Interactive test
        React.createElement('div', {
          className: 'bg-white/[0.03] border border-white/5 rounded-2xl p-6'
        },
          React.createElement('h3', {
            className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase mb-4'
          }, 'Interactive Test'),
          React.createElement('div', { className: 'flex items-center gap-4' },
            React.createElement('button', {
              className: 'px-5 py-2.5 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-colors',
              onClick: function() {
                setCount(function(c) { return c + 1; });
                api.ui.toast('Count: ' + (count + 1));
              }
            }, 'Click: ' + count),
            React.createElement('button', {
              className: 'px-5 py-2.5 bg-white/10 border border-white/5 rounded-xl font-bold text-sm hover:bg-white/20 transition-colors',
              onClick: function() {
                api.storage.set('savedCount', count);
                setSavedCount(count);
                api.ui.toast('Saved count to plugin storage!');
              }
            }, 'Save to Storage'),
            React.createElement('span', {
              className: 'text-white/30 text-sm'
            }, 'Stored: ' + savedCount)
          )
        )
      )
    );
  };

  window.GuteMusik.registerPlugin({
    id: 'test-plugin',
    label: 'Test Plugin',
    icon: 'star',
    view: TestPluginView
  });
})();

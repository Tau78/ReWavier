Pod::Spec.new do |s|
  s.name           = 'ScreenCaptured'
  s.version        = '1.0.0'
  s.summary        = 'UIScreen.isCaptured for ReWavier'
  s.description    = 'Reads whether iOS is recording or mirroring the screen.'
  s.author         = 'ReWavier'
  s.homepage       = 'https://github.com/Tau78/ReWavier'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end

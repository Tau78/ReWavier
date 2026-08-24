import ExpoModulesCore
import UIKit

public class ScreenCapturedModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenCaptured")

    Function("isCaptured") { () -> Bool in
      UIScreen.main.isCaptured
    }
  }
}

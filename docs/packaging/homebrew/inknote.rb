# Plantilla para un tap propio de Homebrew. Sustituye version y los sha256 con los
# valores de los archivos .sha256 publicados junto a cada versión.
cask "inknote" do
  arch arm: "arm64", intel: "x64"

  version "1.5.0"
  sha256 arm:   "REEMPLAZAR_CON_SHA256_ARM64",
         intel: "REEMPLAZAR_CON_SHA256_X64"

  url "https://github.com/craftxdog/InkNotePlus/releases/download/v#{version}/InkNote-#{version}-macos-#{arch}.zip"
  name "InkNote"
  desc "Local-first Markdown notes"
  homepage "https://github.com/craftxdog/InkNotePlus"

  app "InkNote.app"

  zap trash: "~/Library/Application Support/InkNote"
end

# InkNote

Aplicación gratuita de escritorio para notas Markdown con almacenamiento local,
notebooks, etiquetas, estados, editor y vista previa sincronizados y temas.

**[Descargar la última versión](https://github.com/craftxdog/InkNotePlus/releases/latest)**

| Equipo                                 | Archivo que debes elegir |
| -------------------------------------- | ------------------------ |
| Mac con Apple Silicon (serie M)        | `macos-arm64.dmg`        |
| Mac con procesador Intel               | `macos-x64.dmg`          |
| Windows x64                            | `windows-x64-setup.exe`  |
| Linux x64, Debian o Ubuntu             | `linux-x64.deb`          |
| Linux x64, Fedora o distribuciones RPM | `linux-x64.rpm`          |

Los nombres incluyen el número de versión. Cada release también ofrece
`SHA256SUMS` para comprobar la integridad de las descargas.

## Instalación

En macOS, abre el DMG y arrastra InkNote a Aplicaciones. Las descargas usan firma
ad hoc y no están notarizadas por Apple. Si Gatekeeper bloquea el primer inicio,
consulta [cómo abrir una app descargada según Apple](https://support.apple.com/en-us/102445).

En Windows, ejecuta Setup. El instalador no tiene certificado Authenticode;
Windows puede mostrar un aviso de editor desconocido o SmartScreen.

En Linux, instala el DEB o RPM con el gestor de paquetes de tu distribución.

Android está previsto para una siguiente versión y necesita una adaptación móvil.

## Desarrollo y versiones

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm run verify
```

Las versiones siguen `vX.Y.Z` y deben coincidir con `package.json`. Después de
integrar y comprobar los cambios en `main`, `pnpm release` crea el tag local.
`git push origin vX.Y.Z` inicia los builds nativos en GitHub Actions. La release
se publica cuando los cuatro destinos pasan sus pruebas de instalación y uso.
Una versión publicada se conserva; las correcciones reciben un tag nuevo.

El workflow manual de instaladores construye y verifica sin publicar una release.
La publicación corre aparte, valida el tag, commit y los cuatro checks nativos y
reutiliza sus artefactos. En caso de fallo de subida, `Publish release` permite
recuperar ese build con su ID y el ID numérico del borrador, sin recompilar.

[Historial de versiones](CHANGELOG.md) · [Arquitectura y configuración](architecture.md) · [Licencia MIT](../LICENSE)

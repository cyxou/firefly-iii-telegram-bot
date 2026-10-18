{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  # openapi-generator-cli (jbang wrapper) needs a JDK; 17 is the safe LTS for it
  packages = [ pkgs.jdk17 ];
}

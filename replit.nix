{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.typescript
    pkgs.postgresql_16
    pkgs.openssl
  ];
}

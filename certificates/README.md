# ISRG Root X1 for the legacy iPad

`isrg-root-x1.cer` is the unmodified, self-signed ISRG Root X1 certificate in DER format, downloaded over verified HTTPS from:

https://letsencrypt.org/certs/isrgrootx1.der

Official certificate information: https://letsencrypt.org/certificates/

SHA-256 fingerprint:

```text
96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6
```

The copy is provided locally so the iPad can obtain the certificate without first needing to trust the HTTPS chain used by the download site. Installing it adds a system trust anchor; this is a manual action on the iPad, not something the dashboard performs. It is a public CA certificate, not a private key or an application credential.

Check the file locally with:

```sh
openssl x509 -inform DER -in certificates/isrg-root-x1.cer -noout -subject -issuer -fingerprint -sha256
```

Keep the original file unchanged. The test runner checks its pinned SHA-256 fingerprint before running the JavaScript tests.

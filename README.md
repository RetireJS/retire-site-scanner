# retire-scanner

Scans a URL and looks for JavaScript libraries with known vulnerabilities using retire.js. Can also produce a partial SBOM for the site.


### Install

```
git clone git@github.com:RetireJS/retire-scanner.git
cd retire-scanner
npm install
```

### Direct
```
npm run start -- <url> [-v] [--sbom]
```
### Docker

**Build container**

```
git clone git@github.com:RetireJS/retire-scanner.git
cd retire-scanner
docker build -t retire-scanner .
```
**Scanning**
```
docker run --rm retire-scanner [-v] [--sbom]
```

## SBOM support

`retire-scanner` can generate a partial SBOM in the CycloneDX v1.4 format. This cannot be considered a complete SBOM for the web site, as it cannot necessarily detect all technologies in use, but can be used as a partial SBOM listing libraries and services.



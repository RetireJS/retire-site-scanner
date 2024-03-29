# retire-site-scanner

Scans a URL and looks for JavaScript libraries with known vulnerabilities using retire.js. Can also produce a partial SBOM for the site.


## Install with npm

```
npm install -g retire-site-scanner
```
Run:
```
retire-site-scanner [-v] [--sbom] <url> 
```

## Run using docker

```
docker run --rm  ghcr.io/retirejs/retire-site-scanner:latest [-v] [--sbom] <url>
```


## Install from source

```
git clone git@github.com:RetireJS/retire-site-scanner.git
cd retire-site-scanner
npm install
```

### Run directly from source
```
npm run start -- <url> [-v] [--sbom]
```
### Run using Docker

**Build container**

```
git clone git@github.com:RetireJS/retire-site-scanner.git
cd retire-site-scanner
docker build -t retire-site-scanner .
```
**Scanning**
```
docker run --rm retire-site-scanner [-v] [--sbom]
```

## SBOM support

`retire-site-scanner` can generate a partial SBOM in the CycloneDX v1.4 format. This cannot be considered a complete SBOM for the web site, as it cannot necessarily detect all technologies in use, but can be used as a partial SBOM listing libraries and services.



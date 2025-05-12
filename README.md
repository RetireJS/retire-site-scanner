# retire-site-scanner

Scans a URL and looks for JavaScript libraries with known vulnerabilities using retire.js. Can also produce a partial SBOM for the site.


## Install with npm

```
npm install -g retire-site-scanner
```
Run:
```
retire-site-scanner [-v] [--sbom] [--header "Name1: Value1"] [--header "Name2: Value2"] [--cookies "cookie1=value1; cookie2=value2"] <url> 
```

## Run using docker

```
docker run --rm  ghcr.io/retirejs/retire-site-scanner:latest [-v] [--sbom] [--header "Name1: Value1"] [--header "Name2: Value2"] [--cookies "cookie1=value1; cookie2=value2"] <url>
```


## Install from source

```
git clone git@github.com:RetireJS/retire-site-scanner.git
cd retire-site-scanner
npm install
```

### Run directly from source
```
npm run start -- <url> [-v] [--sbom] [--header "Name1: Value1"] [--header "Name2: Value2"] [--cookies "cookie1=value1; cookie2=value2"]
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
docker run --rm retire-site-scanner [-v] [--sbom] [--header "Name1: Value1"] [--header "Name2: Value2"] [--cookies "cookie1=value1; cookie2=value2"] <url>
```

## Options

- `-v`: Verbose output (debug level)
- `-vv`: Very verbose output (trace level)
- `--sbom`: Generate a partial SBOM in CycloneDX format
- `--docker`: Enable Docker-specific settings
- `--color`: Enable colored output
- `--header "Name: Value"`: Add a custom HTTP header to requests (can be specified multiple times for different headers)
- `--cookies "cookie1=value1; cookie2=value2"`: Add cookies to requests

## SBOM support

`retire-site-scanner` can generate a partial SBOM in the CycloneDX v1.4 format. This cannot be considered a complete SBOM for the web site, as it cannot necessarily detect all technologies in use, but can be used as a partial SBOM listing libraries and services.



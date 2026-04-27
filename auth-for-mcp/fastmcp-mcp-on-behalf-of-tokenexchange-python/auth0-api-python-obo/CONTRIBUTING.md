# Contribution

Please read [Auth0's contribution guidelines](https://github.com/auth0/open-source-template/blob/master/GENERAL-CONTRIBUTING.md).

## Environment setup

- Make sure you have node and npm installed
- Run `poetry install` to install dependencies
- Follow the local development steps below to get started

## Local development

- `poetry install`: install dependencies
- `poetry run pytest`: run unit tests 
- `poetry build`: compile the package

## Testing

### Adding tests

Every change should be accompanied by a test.

### Running tests

Run unit tests before opening a PR:

```bash
poetry run pytest
```

Also include any information about essential manual tests.
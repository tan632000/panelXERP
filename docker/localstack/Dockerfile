FROM localstack/localstack:4.12.0

RUN apt-get update \
  && apt-get install -y curl jq \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

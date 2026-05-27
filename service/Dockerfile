# syntax=docker/dockerfile:1

# --- build ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /edwtd ./cmd/edwtd

# --- runtime ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /edwtd /edwtd
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/edwtd"]

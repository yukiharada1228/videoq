{{- define "inference.fullname" -}}
{{- default (printf "%s-%s" .Release.Name .Chart.Name) .Values.fullnameOverride | trunc 48 | trimSuffix "-" -}}
{{- end -}}
{{- define "inference.labels" -}}
app.kubernetes.io/name: videoq-inference
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "inference.image" -}}
{{- if .image.digest -}}
{{ .image.repository }}@{{ .image.digest }}
{{- else if .root.Values.requireImageDigests -}}
{{- fail (printf "%s.image.digest is required when requireImageDigests=true" .component) -}}
{{- else -}}
{{ .image.repository }}:{{ .image.tag }}
{{- end -}}
{{- end -}}
{{- define "inference.security" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: [ALL]
{{- end -}}

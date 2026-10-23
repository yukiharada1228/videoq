{{- define "videoq.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "videoq.fullname" -}}
{{- default (printf "%s-%s" .Release.Name (include "videoq.name" .)) .Values.fullnameOverride | trunc 48 | trimSuffix "-" -}}
{{- end -}}
{{- define "videoq.labels" -}}
app.kubernetes.io/name: {{ include "videoq.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}
{{- define "videoq.selector" -}}
app.kubernetes.io/name: {{ include "videoq.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "videoq.apiImage" -}}
{{ include "videoq.image" (dict "root" . "image" .Values.api.image "component" "api") }}
{{- end -}}
{{- define "videoq.image" -}}
{{- $repository := required (printf "%s.image.repository is required" .component) .image.repository -}}
{{- if .image.digest -}}
{{ printf "%s@%s" $repository .image.digest }}
{{- else if .root.Values.requireImageDigests -}}
{{- fail (printf "%s.image.digest is required when requireImageDigests=true" .component) -}}
{{- else -}}
{{ printf "%s:%s" $repository (required (printf "%s.image.tag is required without a digest" .component) .image.tag) }}
{{- end -}}
{{- end -}}
{{- define "videoq.envFrom" -}}
- configMapRef:
    name: {{ include "videoq.fullname" . }}-config
- secretRef:
    name: {{ .Values.existingSecret }}
{{- end -}}
{{- define "videoq.nodeSecurity" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end -}}
{{- define "videoq.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: [ALL]
{{- end -}}

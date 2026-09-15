terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    random  = { source = "hashicorp/random", version = "~> 3.7" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
  }
}
provider "aws" { region = var.region }
variable "region" { default = "us-west-2" }
variable "name" { default = "nemu" }
variable "web_origin" {
  description = "Optional custom HTTPS origin; blank uses generated CloudFront domain."
  default     = ""
}

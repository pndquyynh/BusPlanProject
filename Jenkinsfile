pipeline {
    agent any

    tools {
        jdk 'java11'
        nodejs 'node18'
    }

    environment {
        // Definieren Sie die Variable für den Docker-Image-Name
        IMAGE_NAME = "siri0000/totallydockerhub"
    }

    stages {
        stage('Build') {
            steps {
                sh 'java -version'
            }
        }
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('SonarQube Analysis') {
            steps {
                script {
                    withSonarQubeEnv('Sonar') {
                        sh 'echo $sonar_scanner'
                        sh """
                        ${env.sonar_scanner} \\
                        -Dsonar.projectKey=totallyspies \\
                        -Dsonar.projectName=totallyspies \\
                        -Dsonar.projectVersion=1.0 \\
                        -Dsonar.sources=backend/src,frontend/src,lstmModel/src \\
                        -Dsonar.tests=backend/test,backend/test/UnitTest/Database,backend/test/UnitTest/gtfs-real-time,backend/test/UnitTest/Util,lstmModel/test \\
                        -Dsonar.sourceEncoding=UTF-8
                        """
                    }
                }
            }
        }
        stage('Build Docker Image') {
            steps {
                script {
                    // Baut das Docker-Image und gibt das Image-Objekt zurück
                    def builtImage = docker.build("${IMAGE_NAME}:${env.BUILD_NUMBER}")
                }
            }
        }
        stage('Push to Docker Hub') {
            steps {
                script {
                    withDockerRegistry(url: 'https://registry.hub.docker.com', credentialsId: 'dockerhubCredentials') {
                        // Push das gebaute Image zu Docker Hub
                        docker.image("${IMAGE_NAME}:${env.BUILD_NUMBER}").push()
                    }
                }
            }
        }
        stage('Trigger ManifestUpdate') {
            steps {
                echo 'Triggering ManifestUpdate'
                build job: 'ManifestUpdate', parameters: [
                    string(name: 'DOCKERTAG', value: "${env.BUILD_NUMBER}")
                ]
            }
        }
        stage('Builds to S3') {
            steps {
                script {
                    // Define the build directory outside any step
                    def buildDir = "/var/lib/jenkins/jobs/'totally spies'/branches/${BRANCH_NAME}/builds/${BUILD_NUMBER}/"

                    // Upload the build archive to S3 (customize bucket and file details)
                    s3Upload(
                        source: "${buildDir}/build_archive.zip",
                        bucket: 'totally-bucket',
                        key: "builds/${BRANCH_NAME}/${BUILD_NUMBER}/build_archive.zip",
                        acl: 'private'
                    )
                    sh "rm ${WORKSPACE}/build_archive.zip"
                }
            }
        }
    }

    post {
        always {
            echo 'Prozess abgeschlossen.'
        }
    }
}

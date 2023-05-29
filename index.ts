import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";

dotenv.config();

const availabilityZoneNames = ['eu-west-2a', 'eu-west-2b'];

export = async () => {
    const vpc = new awsx.ec2.Vpc("slim-travel", {
        availabilityZoneNames: availabilityZoneNames
    });
    const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnet", {
        name: "slim-travel",
        subnetIds: vpc.privateSubnetIds,
    });
    new aws.rds.Cluster("slim-travel", {
        availabilityZones: availabilityZoneNames,
        dbSubnetGroupName: dbSubnetGroup.name,
        backupRetentionPeriod: 35,
        clusterIdentifier: "slim-travel",
        databaseName: "SlimTravel",
        engine: "aurora-postgresql",
        masterUsername: <string>process.env.POSTGRESQL_USERNAME,
        masterPassword: <string>process.env.POSTGRESQL_PASSWORD,
        preferredBackupWindow: "07:00-09:00"
    }, {
        ignoreChanges: ["availabilityZones"]
    });
    const clientVpnEndpoint = new aws.ec2clientvpn.Endpoint("slim-travel-clientvpn", {
        vpcId: vpc.vpcId,
        serverCertificateArn: "arn:aws:acm:eu-west-2:486087129309:certificate/feb470b7-caa5-45a8-935f-146e7ef4eecd",
        clientCidrBlock: "10.1.0.0/16",
        authenticationOptions: [{
            type: "certificate-authentication",
            rootCertificateChainArn: "arn:aws:acm:eu-west-2:486087129309:certificate/fa995600-1a33-4fa4-b9da-c3124f440431",
        }],
        connectionLogOptions: {
            enabled: false
        },
        splitTunnel: true
    });
    vpc.privateSubnetIds.apply(privateSubnetIds => {
        for (let i = 0; i < privateSubnetIds.length; i++) {
            new aws.ec2clientvpn.NetworkAssociation(`slim-travel-${i+1}`, {
                clientVpnEndpointId: clientVpnEndpoint.id,
                subnetId: privateSubnetIds[i],
            });
        }
    });
}
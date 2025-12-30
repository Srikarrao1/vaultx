
import React from 'react';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Avatar from '@mui/material/Avatar';

export const MDBContainer = ({children, ...props}) => <Container {...props}>{children}</Container>;
export const MDBRow = (props) => <Grid container spacing={2} {...props}>{props.children}</Grid>;
export const MDBCol = (props) => <Grid item {...props}>{props.children}</Grid>;
export const MDBBtn = ({children, color='primary', variant='contained', ...props}) => (
  <Button color={color} variant={variant} {...props}>{children}</Button>
);
export const MDBCard = ({children, ...props}) => <Card {...props}>{children}</Card>;
export const MDBCardBody = ({children, ...props}) => <CardContent {...props}>{children}</CardContent>;
export const MDBCardHeader = ({title, subheader, ...props}) => <CardHeader title={title} subheader={subheader} {...props} />;
export const MDBCardTitle = ({children, ...props}) => <Typography variant="h6" {...props}>{children}</Typography>;
export const MDBCardText = ({children, ...props}) => <Typography variant="body2" {...props}>{children}</Typography>;
export const MDBInput = (props) => <TextField fullWidth {...props} />;
export const MDBNavbar = ({children, ...props}) => <AppBar position="static" {...props}><Toolbar>{children}</Toolbar></AppBar>;
export const MDBNavItem = ({children, ...props}) => <Box component="div" {...props}>{children}</Box>;
export const MDBNavLink = ({children, href, ...props}) => <Link href={href} {...props}>{children}</Link>;
export const MDBModal = ({open, onClose, children, ...props}) => <Dialog open={open} onClose={onClose} {...props}>{children}</Dialog>;
export const MDBModalHeader = ({children}) => <DialogTitle>{children}</DialogTitle>;
export const MDBModalBody = ({children}) => <DialogContent>{children}</DialogContent>;
export const MDBModalFooter = ({children}) => <DialogActions>{children}</DialogActions>;
export const MDBDataTable = ({data, ...props}) => {
  // data: { columns: [{label, field}], rows: [{...}] }
  if(!data) return null;
  const { columns = [], rows = [] } = data;
  return (
    <Table {...props}>
      <TableHead>
        <TableRow>
          {columns.map((c, i) => <TableCell key={i}>{c.label}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, ri) => (
          <TableRow key={ri}>
            {columns.map((c, ci) => <TableCell key={ci}>{r[c.field]}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export const MDBIcon = ({icon, ...props}) => <IconButton {...props}><i className={`fa fa-${icon}`}></i></IconButton>;
export const MDBSelect = ({label, value, onChange, children, ...props}) => (
  <FormControl fullWidth>
    {label && <InputLabel>{label}</InputLabel>}
    <Select value={value} onChange={onChange} {...props}>
      {children}
    </Select>
  </FormControl>
);
export const MDBAvatar = (props) => <Avatar {...props} />;
